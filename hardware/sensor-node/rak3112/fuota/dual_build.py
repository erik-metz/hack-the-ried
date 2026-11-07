#!/usr/bin/env python3
"""Build common TTN-data/private-multicast A/B images without credentials."""
import argparse
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT=Path(__file__).resolve().parent
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('version',type=int,choices=[1,2])
    args=parser.parse_args()
    output=ROOT/'build'/'dual-network'/'common'/str(args.version)
    output.mkdir(parents=True,exist_ok=True,mode=0o700)
    fqbn='esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,FlashSize=16M,PSRAM=opi'
    with tempfile.TemporaryDirectory(prefix='fuota-dual-') as temp:
        parent=Path(temp)
        sketch=parent/'ttn_multicast'
        shutil.copytree(ROOT/'ttn_multicast',sketch)
        (parent/'dummy').mkdir()
        for name in ['transfer.h','ota_storage.h','sector_patch.h']:
            shutil.copyfile(ROOT/'dummy'/name,parent/'dummy'/name)
        (sketch/'build_config.h').write_text(f'#define TEST_FIRMWARE_VERSION {args.version}\n')
        subprocess.run(['arduino-cli','compile','--fqbn',fqbn,'--libraries',str(ROOT.parents[2]/'libraries'),
            '--output-dir',str(output),str(sketch)],check=True)
        for path in output.iterdir():
            if path.is_file(): path.chmod(0o600)
    print('Common dual-network image built at '+str(output))
