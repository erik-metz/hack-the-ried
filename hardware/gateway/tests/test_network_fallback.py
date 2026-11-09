"""Network failover policy and recovery; no host networking is modified."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('network_fallback',
    Path(__file__).resolve().parents[1] / 'network/fallback.py')
network = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(network)


class NetworkTests(unittest.TestCase):
    def test_literal_credentials_and_keyfile_escaping(self):
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / 'wifi.env'
            env.write_text('WIFI_SSID="WLAN ü"\n' + r"WIFI_PASSWORD=' $(touch /tmp/never) \ B'" + '\n')
            ssid, password = network.credentials(env)
            profile = network.keyfile(ssid, password, 'test-uuid')
            self.assertIn('ssid=87;76;65;78;32;195;188;', profile)
            self.assertIn('psk=\\s$(touch\\s/tmp/never)\\s', profile)
            self.assertIn('\\\\', profile)
            self.assertIn('route-metric=600', profile)

    def test_invalid_or_duplicate_credentials_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            env = Path(directory) / 'wifi.env'
            for text in ('WIFI_SSID=x\nWIFI_PASSWORD=short',
                         'WIFI_SSID=x\nWIFI_SSID=y\nWIFI_PASSWORD=password',
                         'WIFI_SSID=' + 'ü' * 17 + '\nWIFI_PASSWORD=password'):
                env.write_text(text)
                with self.assertRaises(ValueError):
                    network.credentials(env)

    def test_three_failures_and_three_successes_prevent_route_flapping(self):
        state = {}
        for i in range(3):
            state = network.advance(state, False, True)
            self.assertEqual(state['preferred'], i == 2)
        for i in range(3):
            state = network.advance(state, True, True)
            self.assertEqual(state['preferred'], i < 2)
        self.assertFalse(network.advance(dict(failures=3), False, False)['preferred'])

    def test_failed_first_endpoint_and_ghcr_401_count_as_online(self):
        responses = [subprocess.CompletedProcess([], 28, '000', ''),
                     subprocess.CompletedProcess([], 0, '401', '')]
        with patch.object(network, 'run', side_effect=responses) as run:
            self.assertTrue(network.online('eth0'))
            for call in run.call_args_list:
                self.assertIn('eth0', call.args)
                self.assertNotIn('--insecure', call.args)

    def test_failed_tls_is_not_online_even_with_http_code(self):
        with patch.object(network, 'run', return_value=subprocess.CompletedProcess([], 60, '200', '')):
            self.assertFalse(network.online('wlan0'))

    def test_reboot_clears_persisted_wifi_preference_without_dropping_connection(self):
        with tempfile.TemporaryDirectory() as directory:
            state, runtime = Path(directory) / 'state', Path(directory) / 'runtime'
            state.write_text(json.dumps(dict(phase='confirmed', uuid='ours')))
            result = subprocess.CompletedProcess([], 0, '50\n', '')
            with patch.object(network, 'STATE', state), patch.object(network, 'RUNTIME', runtime), \
                    patch.object(network, 'connected', return_value=True), \
                    patch.object(network, 'online', return_value=True), \
                    patch.object(network, 'nm', return_value=result) as nm:
                network.check()
                nm.assert_any_call('device', 'reapply', 'wlan0')
                nm.assert_any_call('connection', 'modify', 'uuid', 'ours',
                                   'ipv4.route-metric', '600', 'ipv6.route-metric', '600')
                self.assertFalse(any('eth0' in call.args for call in nm.call_args_list))

    def test_pending_rollback_removes_only_own_profile_and_restores_radio(self):
        with tempfile.TemporaryDirectory() as directory:
            state, profile, runtime = [Path(directory) / p for p in ('state', 'profile', 'runtime')]
            state.write_text(json.dumps(dict(phase='pending_verification', uuid='ours', radio='disabled')))
            profile.write_text('secret')
            with patch.object(network, 'STATE', state), patch.object(network, 'PROFILE', profile), \
                    patch.object(network, 'RUNTIME', runtime), patch.object(network, 'nm') as nm, \
                    patch.object(network, 'ctl'):
                network.rollback()
                nm.assert_any_call('connection', 'delete', 'uuid', 'ours', check=False)
                nm.assert_any_call('radio', 'wifi', 'off')
                self.assertFalse(profile.exists())
                self.assertEqual(json.loads(state.read_text())['phase'], 'rolled_back')
                count = nm.call_count
                network.rollback()
                self.assertEqual(nm.call_count, count)

    def test_confirm_requires_our_wifi_and_internet_and_pending_recovery_ignores_confirmed(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / 'state'
            state.write_text(json.dumps(dict(phase='pending_verification', uuid='ours')))
            result = subprocess.CompletedProcess([], 0, 'ours\n', '')
            with patch.object(network, 'STATE', state), patch.object(network, 'nm', return_value=result), \
                    patch.object(network, 'online', return_value=False), patch.object(network, 'ctl') as ctl:
                with self.assertRaises(ValueError):
                    network.confirm()
                ctl.assert_not_called()
            with patch.object(network, 'STATE', state), patch.object(network, 'nm', return_value=result) as nm, \
                    patch.object(network, 'online', return_value=True), patch.object(network, 'ctl'):
                network.confirm()
                self.assertEqual(json.loads(state.read_text())['phase'], 'confirmed')
                count = nm.call_count
                network.rollback()
                self.assertEqual(nm.call_count, count)

    def test_recovery_is_armed_before_profile_or_radio_changes(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            state, profile = root / 'state', root / 'profile'
            env = root / 'env'
            env.write_text('WIFI_SSID=test\nWIFI_PASSWORD=password\n')
            events = []
            def nm(*args, **kwargs):
                events.append(args)
                if 'GENERAL.NM-MANAGED' in args:
                    output = 'yes'
                elif 'GENERAL.CON-UUID' in args:
                    output = 'lan-uuid'
                elif any('route-metric' in a for a in args):
                    output = '100'
                elif args == ('radio', 'wifi'):
                    output = 'disabled'
                else:
                    output = '802-3-ethernet'
                return subprocess.CompletedProcess([], 0, output, '')
            def ctl(*args, **kwargs):
                events.append(args)
                if args == ('is-active', network.TIMER):
                    raise subprocess.CalledProcessError(1, [])
            with patch.object(network, 'STATE', state), patch.object(network, 'PROFILE', profile), \
                    patch.object(network, 'run'), patch.object(network, 'nm', side_effect=nm), \
                    patch.object(network, 'install_units'), patch.object(network, 'ctl', side_effect=ctl):
                with self.assertRaises(subprocess.CalledProcessError):
                    network.apply(env)
            self.assertTrue(state.exists())
            self.assertFalse(profile.exists())
            self.assertNotIn(('radio', 'wifi', 'on'), events)

            # AP absent during installation: retain autoconnect and monitoring,
            # but keep recovery pending until real Internet can be confirmed.
            state.unlink()
            events.clear()
            def absent_ap(*args, **kwargs):
                result = nm(*args, **kwargs)
                if args[:2] == ('connection', 'up'):
                    result.returncode = 10
                return result
            def working_ctl(*args, **kwargs):
                events.append(args)
            with patch.object(network, 'STATE', state), patch.object(network, 'PROFILE', profile), \
                    patch.object(network, 'run'), patch.object(network, 'nm', side_effect=absent_ap), \
                    patch.object(network, 'install_units'), patch.object(network, 'ctl', side_effect=working_ctl):
                network.apply(env)
            self.assertEqual(json.loads(state.read_text())['phase'], 'pending_verification')
            activation = next(i for i, event in enumerate(events) if event[:2] == ('connection', 'up'))
            self.assertLess(events.index(('enable', '--now', network.MONITOR)), activation)
            self.assertEqual(profile.stat().st_mode & 0o777, 0o600)


if __name__ == '__main__':
    unittest.main()
