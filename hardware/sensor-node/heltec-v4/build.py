#!/usr/bin/env python3
"""Build credential-free Heltec V4.3 tracker images with shared lab receiver."""
import argparse
from pathlib import Path
import shutil,subprocess,tempfile
ROOT=Path(__file__).resolve().parent
FQBN='esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,FlashSize=16M,PSRAM=enabled'
if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--firmware',type=int,choices=[1,2],default=1)
    args=parser.parse_args()
    output=ROOT/'build'/str(args.firmware);output.mkdir(parents=True,exist_ok=True,mode=0o700)
    shared=ROOT.parent/'rak3112'/'fuota'
    with tempfile.TemporaryDirectory(prefix='heltec-tracker-') as temp:
        parent=Path(temp);sketch=parent/'v1';shutil.copytree(ROOT/'v1',sketch)
        (sketch/'build_config.h').write_text(f'#define TEST_FIRMWARE_VERSION {args.firmware}\n')
        shutil.copyfile(shared/'ttn_multicast'/'credentials.h',sketch/'credentials.h')
        (parent/'dummy').mkdir()
        for name in ['transfer.h','ota_storage.h','sector_patch.h']:
            shutil.copyfile(shared/'dummy'/name,parent/'dummy'/name)
        subprocess.run(['arduino-cli','compile','--fqbn',FQBN,'--output-dir',str(output),str(sketch)],check=True)
    for path in output.iterdir():
        if path.is_file():path.chmod(0o600)
    print('Heltec image: '+str(output))
