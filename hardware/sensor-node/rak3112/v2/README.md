# RAK3112 SHT41 firmware v2.0.0

This version reads an SHT41 attached to a RAK3112 on the RAK3212 breakout:

| SHT41 | RAK3112 GPIO |
| --- | --- |
| SDA | IO17 |
| SCL | IO14 |
| VDD / GND | Use the sensor board's supported supply and common ground |

The sketch uses the SHT4x high-precision single-shot command at I²C address
`0x44` and checks both returned CRC bytes. Metric code 1 is temperature in
0.1 °C; code 2 is relative humidity in 0.1 %. Invalid sensor reads are logged
and skipped.

## Payload format 4

FPort 10 payloads start with four header bytes: format (`4`), firmware major,
minor, patch (`2,0,0`). Remaining data repeats five-byte metric records:
one metric code and one signed 32-bit big-endian value. Firmware version is
decoded as `firmware_version` metadata, never as a sensor measurement.
The shared formatter also retains support for format 3 from firmware v1.

## Provisioning and flashing

Create a new TTN end device for this physical RAK in the existing sensor
application and assign its own OTAA JoinEUI, DevEUI, NwkKey and AppKey. Do not
reuse the credentials of the earlier RAK. Copy `secrets.h.example` to
`secrets.h` in this folder and paste the new keys there locally; `secrets.h`
is ignored by Git.

With Arduino CLI and RadioLib installed:

```sh
arduino-cli compile --fqbn 'esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,FlashSize=16M,PSRAM=opi' hardware/sensor-node/rak3112/v2
arduino-cli upload -p /dev/cu.usbmodem11101 --fqbn 'esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,FlashSize=16M,PSRAM=opi' hardware/sensor-node/rak3112/v2
arduino-cli monitor -p /dev/cu.usbmodem11101 -c baudrate=115200
```

The serial log must report firmware `v2.0.0`, a valid SHT41 sample, and an
OTAA join before checking decoded uplinks in TTN and the VPS. Keep the EU868
antenna connected during radio operation. The current development gateway
configuration is single-channel and is only suitable for bring-up.

The shared formatter protocol tests are run with:

```sh
node --test hardware/sensor-node/rak3112/v1/payload-formatter.test.mjs
```
