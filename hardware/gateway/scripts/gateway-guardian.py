#!/usr/bin/env python3
"""Host-side update guard. Keeps the last radio-ready image and pauses bad rollouts."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import time


def run(*args):
    return subprocess.check_output(args, text=True, stderr=subprocess.DEVNULL).strip()


def write_json(path, data):
    path.parent.mkdir(parents=True,exist_ok=True,mode=0o700)
    temp = path.with_suffix('.tmp')
    temp.write_text(json.dumps(data))
    temp.chmod(0o600)
    os.replace(temp,path)


def pin_image(env_path, image):
    if not re.fullmatch(r'kamue-gateway-rollback:[a-f0-9]+',image):
        raise ValueError('Invalid local rollback tag')
    lines = env_path.read_text().splitlines()
    lines = [line for line in lines if not line.startswith('GATEWAY_IMAGE=')]
    lines.append('GATEWAY_IMAGE='+image)
    temp = env_path.with_suffix('.rollback-tmp')
    fd = os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w') as f:
        f.write('\n'.join(lines)+'\n'); f.flush(); os.fsync(f.fileno())
    os.replace(temp,env_path)


def rollback(directory, good, state_path):
    image = good['image']
    if not re.fullmatch(r'sha256:[a-f0-9]{64}',image):
        raise ValueError('Invalid saved Docker image ID')
    # The old image is pinned before replacing the container. Never pull to recover.
    tag = 'kamue-gateway-rollback:'+image.split(':')[1][:16]
    run('docker','tag',image,tag)
    subprocess.run(['docker','stop','kamue-gateway-watchtower'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
    pin_image(directory/'.env',tag)
    state = dict(good=good, paused=True, reason='candidate_failed', rollback_at=time.time())
    write_json(state_path,state)
    args = ['docker','compose','--project-directory',str(directory),'-f',str(directory/'compose.yml')]
    run(*args,'up','-d','--no-deps','--force-recreate','basicstation')
    print('Rolled back to last radio-ready image; automatic updates paused',flush=True)


def tick(directory,state_path,window=180):
    state = json.loads(state_path.read_text()) if state_path.exists() else {}
    if state.get('paused'):
        return
    raw = run('docker','inspect','kamue-basicstation')
    info = json.loads(raw)[0]
    image = info['Image']
    health = info['State'].get('Health',{}).get('Status')
    good = state.get('good')
    if not good:
        if health == 'healthy':
            record = json.loads((directory/'state/health.json').read_text())
            if record.get('lns_connected'):
                # Explicit initial acceptance; Docker health includes radio init.
                state['good'] = dict(image=image, at=time.time())
                run('docker','tag',image,'kamue-gateway-rollback:'+image.split(':')[1][:16])
                write_json(state_path,state)
                print('Initial radio/LNS-ready image retained',flush=True)
        return
    if image == good['image']:
        if state.pop('candidate',None):
            write_json(state_path,state)
        return
    candidate = state.get('candidate')
    if not candidate or candidate['image'] != image:
        state['candidate'] = dict(image=image, started=time.time())
        write_json(state_path,state)
        return
    if health == 'healthy':
        candidate.setdefault('healthy_since',time.time())
    else:
        candidate.pop('healthy_since',None)
    write_json(state_path,state)
    elapsed = time.time()-candidate['started']
    if health == 'healthy' and time.time()-candidate['healthy_since'] >= window:
        state['good'] = dict(image=image,at=time.time())
        state.pop('candidate',None)
        run('docker','tag',image,'kamue-gateway-rollback:'+image.split(':')[1][:16])
        write_json(state_path,state)
        print('Candidate radio-ready image accepted',flush=True)
    elif elapsed >= window*2:
        rollback(directory,good,state_path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--directory',type=Path,required=True)
    parser.add_argument('--state',type=Path,default=Path('/var/lib/kamue-gateway-guardian/state.json'))
    parser.add_argument('--window',type=int,default=180)
    args = parser.parse_args()
    os.umask(0o077)
    while True:
        try:
            tick(args.directory,args.state,args.window)
        except Exception as exc:
            # Docker inspect includes env credentials: never dump it or tracebacks.
            print('Guardian check failed: '+type(exc).__name__,flush=True)
        time.sleep(10)


if __name__ == '__main__':
    main()
