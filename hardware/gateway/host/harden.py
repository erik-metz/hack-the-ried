#!/usr/bin/python3
"""Pi host hardening with a persistent, independent lockout recovery timer."""
import argparse
import base64
import json
import os
from pathlib import Path
import pwd
import re
import subprocess
import time

ASSETS = Path(__file__).resolve().parent
STATE = Path('/var/lib/kamue-gateway-hardening/state.json')
INSTALLED = '/usr/local/lib/kamue-gateway/host/harden.py'
FIREWALL = 'kamue-gateway-firewall.service'
TIMER = 'kamue-gateway-hardening-recovery.timer'
DISABLE = ('ssh.service', 'ssh.socket', 'avahi-daemon.service',
           'avahi-daemon.socket', 'bluetooth.service')
APT_TIMERS = ('apt-daily.timer', 'apt-daily-upgrade.timer')
MANAGED = (Path('/etc/ssh/sshd_config.d/00-kamue-gateway.conf'),
           Path('/etc/apt/apt.conf.d/52kamue-security-upgrades'),
           Path('/etc/kamue-gateway/input.nft'))


def run(*args, check=True, input=None):
    return subprocess.run(args, check=check, input=input, text=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def systemctl(*args, **kwargs):
    return run('systemctl', *args, **kwargs)


def unit_state(unit):
    return dict(enabled=systemctl('is-enabled', unit, check=False).stdout.strip(),
                active=systemctl('is-active', unit, check=False).stdout.strip(),
                load=systemctl('show', unit, '-p', 'LoadState', '--value',
                               check=False).stdout.strip())


def write(path, content, mode=0o600):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name+'.kamue-tmp')
    fd = os.open(temporary, os.O_CREAT | os.O_TRUNC | os.O_WRONLY, mode)
    with os.fdopen(fd, 'w') as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.chmod(mode)
    os.replace(temporary, path)


def save(state):
    STATE.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    write(STATE, json.dumps(state))


def firewall(action):
    exists = run('nft', 'list', 'table', 'inet', 'kamue_gateway_host',
                 check=False).returncode == 0
    delete = 'delete table inet kamue_gateway_host\n' if exists else ''
    if action == 'stop':
        if delete:
            run('nft', '-f', '-', input=delete)
        return
    rules = delete + MANAGED[2].read_text()
    # One transaction replaces only our table. A failed validation changes nothing.
    run('nft', '-c', '-f', '-', input=rules)
    run('nft', '-f', '-', input=rules)


def install_units():
    service = Path('/etc/systemd/system')
    write(service/FIREWALL, f'''[Unit]
Description=Gateway host input firewall (IPv4 and IPv6)
DefaultDependencies=no
After=local-fs.target
Before=network-pre.target docker.service shutdown.target
Wants=network-pre.target
Conflicts=shutdown.target
[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/bin/python3 -I {INSTALLED} firewall-start
ExecReload=/usr/bin/python3 -I {INSTALLED} firewall-start
ExecStop=/usr/bin/python3 -I {INSTALLED} firewall-stop
[Install]
WantedBy=multi-user.target
''', 0o644)
    write(service/'kamue-gateway-hardening-recovery.service', f'''[Unit]
Description=Recover access after unconfirmed gateway hardening
After=docker.service
[Service]
Type=oneshot
ExecStart=/usr/bin/python3 -I {INSTALLED} rollback
''', 0o644)
    write(service/TIMER, '''[Unit]
Description=Rollback gateway hardening unless verified within ten minutes
[Timer]
OnActiveSec=10min
AccuracySec=1s
Unit=kamue-gateway-hardening-recovery.service
[Install]
WantedBy=timers.target
''', 0o644)
    systemctl('daemon-reload')


def apply(user):
    if not re.fullmatch(r'[a-z_][a-z0-9_-]*', user):
        raise ValueError('Invalid local username')
    account = pwd.getpwnam(user)
    if account.pw_uid == 0:
        raise ValueError('Connect must run as an ordinary user')
    if STATE.exists():
        raise ValueError('Existing hardening state: inspect status before another apply')
    for tool in ('nft', 'unattended-upgrade'):
        run('which', tool)
    # Never overwrite an independently configured firewall from another task.
    if run('nft', 'list', 'table', 'inet', 'kamue_gateway_host', check=False).returncode == 0:
        raise ValueError('Managed firewall table already exists')
    state = dict(phase='prepared', user=user, started=time.time(),
                 units={u: unit_state(u) for u in (*DISABLE, *APT_TIMERS)}, files={})
    for path in MANAGED:
        state['files'][str(path)] = (dict(content=base64.b64encode(path.read_bytes()).decode(),
                                          mode=path.stat().st_mode & 0o777)
                                    if path.exists() else None)
    save(state)
    install_units()
    # Enabled timer survives a reboot during verification; no cloud dependency.
    systemctl('enable', '--now', TIMER)
    systemctl('is-active', TIMER)
    run('loginctl', 'enable-linger', user)
    run('runuser', '-u', user, '--', 'env',
        f'XDG_RUNTIME_DIR=/run/user/{account.pw_uid}',
        'systemctl', '--user', 'enable', '--now', 'rpi-connect.service')
    write(MANAGED[0], 'PermitRootLogin no\nPasswordAuthentication no\n'
          'KbdInteractiveAuthentication no\nPubkeyAuthentication yes\n', 0o644)
    run('/usr/sbin/sshd', '-t')
    write(MANAGED[1], (ASSETS/'52kamue-security-upgrades').read_text(), 0o644)
    write(MANAGED[2], (ASSETS/'input.nft').read_text(), 0o600)
    systemctl('enable', '--now', FIREWALL)
    for unit in DISABLE:
        if state['units'][unit]['load'] != 'not-found':
            systemctl('disable', '--now', unit)
            systemctl('mask', unit)
    systemctl('enable', '--now', *APT_TIMERS)
    state['phase'] = 'pending_verification'
    save(state)
    print('Hardening applied; automatic rollback in ten minutes until confirmed')


def rollback(force=False):
    state = json.loads(STATE.read_text())
    if state['phase'] == 'rolled_back' or (state['phase'] == 'confirmed' and not force):
        return
    systemctl('disable', '--now', FIREWALL, check=False)
    firewall('stop')
    for name, backup in state['files'].items():
        path = Path(name)
        if backup is None:
            path.unlink(missing_ok=True)
        else:
            write(path, base64.b64decode(backup['content']).decode(), backup['mode'])
    for unit, previous in state['units'].items():
        if previous['load'] == 'not-found':
            continue
        systemctl('unmask', unit)
        if previous['enabled'].startswith('masked'):
            systemctl('mask', unit)
        elif previous['enabled'] in ('enabled', 'enabled-runtime'):
            systemctl('enable', unit)
        else:
            systemctl('disable', unit, check=False)
        if previous['active'] == 'active':
            systemctl('start', unit)
        else:
            systemctl('stop', unit)
    state['phase'] = 'rolled_back'
    save(state)
    systemctl('disable', '--now', TIMER)
    print('Previous host access restored; Docker rules were not replaced')


def confirm():
    state = json.loads(STATE.read_text())
    if state['phase'] != 'pending_verification':
        raise ValueError('No pending hardening trial')
    systemctl('is-active', FIREWALL)
    table = json.loads(run('nft', '-j', 'list', 'table', 'inet', 'kamue_gateway_host').stdout)
    if not any(x.get('chain', {}).get('policy') == 'drop' for x in table['nftables']):
        raise ValueError('Default drop policy is missing')
    for unit in DISABLE:
        if systemctl('is-active', unit, check=False).returncode == 0:
            raise ValueError('Unneeded service still active: '+unit)
    # Stop a queued recovery before accepting; never race with a running rollback.
    systemctl('stop', TIMER)
    recovery = 'kamue-gateway-hardening-recovery.service'
    if systemctl('is-active', recovery, check=False).stdout.strip() in ('active', 'activating'):
        raise ValueError('Recovery already started; wait for rollback')
    state = json.loads(STATE.read_text())
    if state['phase'] != 'pending_verification':
        raise ValueError('Recovery changed hardening state')
    state.update(phase='confirmed', confirmed=time.time())
    save(state)
    systemctl('disable', TIMER)
    print('Verified hardening retained; recovery timer disabled')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=('apply', 'confirm', 'rollback', 'restore', 'status',
                                           'firewall-start', 'firewall-stop'))
    parser.add_argument('--user', default='alpha')
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error('Run with sudo')
    os.umask(0o077)
    if args.action.startswith('firewall-'):
        firewall(args.action.split('-')[1])
    elif args.action == 'apply':
        apply(args.user)
    elif args.action == 'confirm':
        confirm()
    elif args.action in ('rollback', 'restore'):
        rollback(force=args.action == 'restore')
    else:
        print(STATE.read_text() if STATE.exists() else 'Not applied')


if __name__ == '__main__':
    main()
