#!/usr/bin/python3
"""NetworkManager Wi-Fi standby and bounded LAN Internet failover, on the host."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import uuid

ROOT = Path('/var/lib/kamue-gateway-network')
STATE = ROOT / 'state.json'
RUNTIME = Path('/run/kamue-gateway-network.json')
PROFILE = Path('/etc/NetworkManager/system-connections/kamue-fallback.nmconnection')
INSTALLED = '/usr/local/lib/kamue-gateway/network/fallback.py'
TIMER = 'kamue-gateway-network-recovery.timer'
MONITOR = 'kamue-gateway-network.timer'
PROBES = ('https://eu1.cloud.thethings.network/',
          'https://1.1.1.1/cdn-cgi/trace')
NORMAL_METRIC = 600
FAILOVER_METRIC = 50


def run(*args, check=True):
    # Capture errors: commands may involve a secret-bearing keyfile. Never log them.
    return subprocess.run(args, check=check, text=True, capture_output=True, timeout=25,
                          env={**os.environ, 'LC_ALL': 'C'})


def nm(*args, **kwargs):
    return run('nmcli', '--wait', '20', *args, **kwargs)


def ctl(*args, **kwargs):
    return run('systemctl', *args, **kwargs)


def write(path, content):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix('.tmp')
    fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, 'w') as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.chmod(0o600)
    temporary.replace(path)


def save(state):
    write(STATE, json.dumps(state))


def credentials(path):
    """Read literal dotenv assignments; never source or expand shell expressions."""
    values = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith('#'):
            continue
        key, separator, value = line.partition('=')
        key, value = key.strip(), value.strip()
        if key not in ('WIFI_SSID', 'WIFI_PASSWORD'):
            continue
        if not separator or key in values:
            raise ValueError('Missing assignment or duplicate Wi-Fi setting')
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        if any(ord(c) < 32 or ord(c) == 127 for c in value):
            raise ValueError('Control characters in Wi-Fi setting')
        values[key] = value
    ssid, password = values.get('WIFI_SSID', ''), values.get('WIFI_PASSWORD', '')
    if not 1 <= len(ssid.encode()) <= 32:
        raise ValueError('SSID must contain 1–32 UTF-8 bytes')
    if not (8 <= len(password.encode()) <= 63 or re.fullmatch('[0-9a-fA-F]{64}', password)):
        raise ValueError('Invalid WPA-PSK length')
    return ssid, password


def keyfile(ssid, password, connection_uuid):
    # Byte-array SSID and GLib keyfile escapes preserve spaces and backslashes.
    ssid_bytes = ';'.join(str(c) for c in ssid.encode()) + ';'
    password = password.replace('\\', '\\\\').replace(' ', '\\s')
    return f'''[connection]
id=kamue-wifi-fallback
uuid={connection_uuid}
type=wifi
interface-name=wlan0
autoconnect=true
autoconnect-retries=0

[wifi]
mode=infrastructure
ssid={ssid_bytes}

[wifi-security]
key-mgmt=wpa-psk
psk={password}
psk-flags=0

[ipv4]
method=auto
route-metric={NORMAL_METRIC}

[ipv6]
method=auto
route-metric={NORMAL_METRIC}
'''


def online(interface):
    # Any HTTP response over verified TLS proves connectivity. The numeric backup
    # avoids depending on a broken LAN DNS server to discover usable Wi-Fi.
    for url in PROBES:
        result = run('curl', '--silent', '--output', '/dev/null', '--noproxy', '*',
                     '--interface', interface, '--connect-timeout', '3',
                     '--max-time', '5', '--write-out', '%{http_code}', url, check=False)
        if result.returncode == 0 and re.fullmatch('[1-5][0-9]{2}', result.stdout):
            return True
    return False


def connected(interface):
    return nm('-g', 'GENERAL.STATE', 'device', 'show', interface,
              check=False).stdout.strip().startswith('100 ')


def install_units():
    units = {
        'kamue-gateway-network.service': f'''[Unit]
Description=Check gateway LAN and Wi-Fi Internet routes
After=NetworkManager.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 -I {INSTALLED} check
TimeoutStartSec=100
''',
        MONITOR: '''[Unit]
Description=Monitor gateway Internet failover
[Timer]
OnBootSec=45s
OnUnitInactiveSec=30s
Unit=kamue-gateway-network.service
[Install]
WantedBy=timers.target
''',
        'kamue-gateway-network-recovery.service': f'''[Unit]
Description=Recover unconfirmed gateway Wi-Fi configuration
After=NetworkManager.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 -I {INSTALLED} rollback
TimeoutStartSec=100
''',
        TIMER: '''[Unit]
Description=Undo gateway Wi-Fi setup unless confirmed within 15 minutes
[Timer]
OnActiveSec=15min
AccuracySec=1s
Unit=kamue-gateway-network-recovery.service
[Install]
WantedBy=timers.target
''',
    }
    for name, content in units.items():
        write(Path('/etc/systemd/system') / name, content)
    ctl('daemon-reload')


def apply(env):
    ssid, password = credentials(env)
    if STATE.exists() or PROFILE.exists():
        raise ValueError('Existing network setup: inspect status; do not overwrite')
    run('which', 'curl')
    if nm('-g', 'GENERAL.NM-MANAGED', 'device', 'show', 'wlan0').stdout.strip() != 'yes':
        raise ValueError('wlan0 is not managed by NetworkManager')
    # Refuse ambiguous existing Wi-Fi policies. Never edit unrelated profiles.
    kinds = nm('-t', '-f', 'TYPE', 'connection', 'show').stdout.splitlines()
    if '802-11-wireless' in kinds or 'wifi' in kinds:
        raise ValueError('Existing Wi-Fi profiles require manual review')
    lan_uuid = nm('-g', 'GENERAL.CON-UUID', 'device', 'show', 'eth0').stdout.strip()
    if not lan_uuid or lan_uuid == '--':
        raise ValueError('Install with an active LAN connection')
    for family in ('ipv4', 'ipv6'):
        metric = int(nm('-g', family + '.route-metric', 'connection', 'show',
                        'uuid', lan_uuid).stdout.strip())
        if metric != -1 and not FAILOVER_METRIC < metric < NORMAL_METRIC:
            raise ValueError('LAN metric must lie between 50 and 600 (or automatic)')
    state = dict(phase='pending_verification', uuid=str(uuid.uuid4()),
                 radio=nm('radio', 'wifi').stdout.strip())
    save(state)
    install_units()
    ctl('enable', '--now', TIMER)
    ctl('is-active', TIMER)
    write(PROFILE, keyfile(ssid, password, state['uuid']))
    nm('connection', 'load', str(PROFILE))
    nm('radio', 'wifi', 'on')
    # Do not disconnect eth0, restart NetworkManager, or touch the firewall.
    nm('connection', 'up', 'uuid', state['uuid'])
    ctl('enable', '--now', MONITOR)
    print('Wi-Fi standby installed; confirm within 15 minutes or it is rolled back')


def set_metric(state, metric):
    nm('connection', 'modify', 'uuid', state['uuid'], 'ipv4.route-metric', str(metric),
       'ipv6.route-metric', str(metric))
    # Reapply routes without dropping the Wi-Fi association or DHCP lease.
    nm('device', 'reapply', 'wlan0')


def advance(previous, lan, wifi):
    failures = 0 if lan else min(previous.get('failures', 0) + 1, 3)
    successes = min(previous.get('successes', 0) + 1, 3) if lan else 0
    preferred = previous.get('preferred', False)
    if failures >= 3 and wifi:
        preferred = True
    elif successes >= 3 or not wifi:
        preferred = False
    return dict(failures=failures, successes=successes, preferred=preferred,
                lan_online=lan, wifi_online=wifi)


def check():
    state = json.loads(STATE.read_text())
    if state['phase'] not in ('pending_verification', 'confirmed'):
        return
    previous = json.loads(RUNTIME.read_text()) if RUNTIME.exists() else {}
    lan = connected('eth0') and online('eth0')
    wifi = connected('wlan0') and online('wlan0')
    current = advance(previous, lan, wifi)
    metric = FAILOVER_METRIC if current['preferred'] else NORMAL_METRIC
    # Read actual profile too: a reboot must reset a persisted failover metric.
    actual = int(nm('-g', 'ipv4.route-metric', 'connection', 'show',
                    'uuid', state['uuid']).stdout.strip())
    if actual != metric:
        set_metric(state, metric)
        print('Internet route preference: ' + ('Wi-Fi' if current['preferred'] else 'LAN'))
    write(RUNTIME, json.dumps(current))


def rollback(force=False):
    state = json.loads(STATE.read_text())
    if state['phase'] == 'rolled_back' or (state['phase'] == 'confirmed' and not force):
        return
    ctl('disable', '--now', MONITOR, check=False)
    # Delete only the UUID created by this installer, then restore the radio state.
    nm('connection', 'delete', 'uuid', state['uuid'], check=False)
    PROFILE.unlink(missing_ok=True)
    nm('radio', 'wifi', 'on' if state['radio'] == 'enabled' else 'off')
    state['phase'] = 'rolled_back'
    save(state)
    RUNTIME.unlink(missing_ok=True)
    ctl('disable', '--now', TIMER)
    print('Previous network configuration restored; LAN was not modified')


def confirm():
    state = json.loads(STATE.read_text())
    if state['phase'] != 'pending_verification':
        raise ValueError('No unconfirmed installation')
    active_uuid = nm('-g', 'GENERAL.CON-UUID', 'device', 'show', 'wlan0').stdout.strip()
    if active_uuid != state['uuid'] or not online('wlan0'):
        raise ValueError('Managed Wi-Fi connection must have verified Internet access')
    ctl('disable', '--now', TIMER)
    state['phase'] = 'confirmed'
    save(state)
    print('Wi-Fi Internet verified; automatic installation rollback disarmed')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=('apply', 'check', 'confirm', 'rollback', 'restore', 'status'))
    parser.add_argument('--env', type=Path)
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error('Run with sudo')
    ROOT.mkdir(mode=0o700, parents=True, exist_ok=True)
    ROOT.chmod(0o700)
    # Serialize confirm, monitor and recovery, including queued systemd jobs.
    with (ROOT / 'lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            if args.action == 'apply':
                if args.env is None:
                    raise ValueError('--env is required')
                apply(args.env)
            elif args.action == 'check':
                check()
            elif args.action == 'confirm':
                confirm()
            elif args.action in ('rollback', 'restore'):
                rollback(force=args.action == 'restore')
            else:
                print(STATE.read_text() if STATE.exists() else 'Not installed')
                if RUNTIME.exists():
                    print(RUNTIME.read_text())
        except (OSError, ValueError, subprocess.SubprocessError):
            # Do not echo arguments, env values, command output or tracebacks.
            print('Network action failed; inspect device/service status. Recovery remains armed if pending.')
            raise SystemExit(1)


if __name__ == '__main__':
    main()
