"""Exercise recovery without changing the test host's services or firewall."""
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location('host_hardening',
    Path(__file__).resolve().parents[1]/'host/harden.py')
host = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(host)


class HostHardeningTests(unittest.TestCase):
    def test_failed_firewall_validation_never_applies_or_flushes_docker(self):
        with tempfile.TemporaryDirectory() as d:
            rules = Path(d)/'input.nft'
            rules.write_text('table inet kamue_gateway_host {}\n')
            calls = []
            def fake(*args, **kw):
                calls.append((args, kw))
                if '-c' in args:
                    raise subprocess.CalledProcessError(1,args)
                return subprocess.CompletedProcess(args,0,'','')
            with patch.object(host,'MANAGED',(None,None,rules)), patch.object(host,'run',fake):
                with self.assertRaises(subprocess.CalledProcessError):
                    host.firewall('start')
            self.assertEqual(len(calls),2)
            self.assertIn('delete table inet kamue_gateway_host',calls[1][1]['input'])
            self.assertNotIn('flush ruleset',calls[1][1]['input'])

    def test_rollback_restores_previous_files_and_access_once(self):
        with tempfile.TemporaryDirectory() as d:
            state_path = Path(d)/'state.json'
            config = Path(d)/'config'
            config.write_text('new policy')
            state = dict(phase='pending_verification', files={str(config):None}, units={
                'ssh.service':dict(load='loaded',enabled='enabled',active='active'),
                'bluetooth.service':dict(load='loaded',enabled='disabled',active='inactive')})
            state_path.write_text(json.dumps(state))
            with patch.object(host,'STATE',state_path), patch.object(host,'systemctl') as ctl, \
                    patch.object(host,'firewall') as firewall:
                host.rollback()
                self.assertFalse(config.exists())
                self.assertEqual(json.loads(state_path.read_text())['phase'],'rolled_back')
                ctl.assert_any_call('enable','ssh.service')
                ctl.assert_any_call('start','ssh.service')
                ctl.assert_any_call('stop','bluetooth.service')
                firewall.assert_called_once_with('stop')
                before = ctl.call_count
                host.rollback()
                self.assertEqual(ctl.call_count,before)

    def test_confirmation_refuses_accept_policy_and_keeps_recovery_armed(self):
        with tempfile.TemporaryDirectory() as d:
            state_path = Path(d)/'state.json'
            state_path.write_text(json.dumps(dict(phase='pending_verification')))
            result = subprocess.CompletedProcess([],0,json.dumps(dict(nftables=[
                dict(chain=dict(policy='accept'))])), '')
            with patch.object(host,'STATE',state_path), patch.object(host,'run',return_value=result), \
                    patch.object(host,'systemctl') as ctl:
                with self.assertRaises(ValueError):
                    host.confirm()
                self.assertFalse(any(c.args[:1] == ('stop',) for c in ctl.call_args_list))
                self.assertEqual(json.loads(state_path.read_text())['phase'],'pending_verification')


if __name__ == '__main__':
    unittest.main()
