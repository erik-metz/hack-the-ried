# RAK3112 SHT41 + SGP41 firmware v4

TTN uplink decoder for this firmware: [`payload-formatter.js`](payload-formatter.js).
Install this file in TTN before flashing this firmware.

This version reads an SHT41 and an SGP41 on the same RAK3212 I²C bus:

| Sensor | Signal | RAK3112 GPIO | I²C address |
| --- | --- | --- | --- |
| SHT41 | SDA | IO14 | `0x44` |
| SHT41 | SCL | IO13 | `0x44` |
| SGP41 | SDA | IO14 | `0x59` |
| SGP41 | SCL | IO13 | `0x59` |

Power both sensor boards according to their board specifications, use a common
ground, and keep the I²C pull-ups compatible with 3.3 V. The firmware starts
the SGP41 conditioning sequence for 10 seconds after boot, then reads both raw
signals every second with temperature and humidity compensation from the SHT41
when available. If the SHT41 is not detected, it uses Sensirion's default
compensation values (50 % RH / 25 °C) and sends only SGP41 gas signals.
The first VOC+NOx measurement is discarded as required by Sensirion when the
Gas Index Algorithm is not used. The latest valid sample is sent every five
minutes.

Metric code 27 is `sgp41_voc_raw` and code 28 is `sgp41_nox_raw`; both are
unscaled raw ticks and are not concentration values or air-quality indices.
Codes 29 and 30 are reserved for VOC and NOx indices from Sensirion's Gas Index
Algorithm; this firmware does not emit those indices.

## Payload format 4

FPort 10 payloads start with two header bytes: format (`4`) and firmware
version (`4`). Remaining data repeats five-byte metric records: one metric code
and one signed 32-bit big-endian value. Firmware version is decoded as
`firmware_version` metadata, never as a sensor measurement.

## Provisioning and flashing

Create one TTN end device per physical RAK and assign it unique OTAA credentials.
Store those credentials in the local profile matching the exact TTN device ID;
never commit real keys.

```sh
./hardware/sensor-node/rak3112/build.sh v4 <ttn-device-id>
./hardware/sensor-node/rak3112/build.sh v4 <ttn-device-id> --port /dev/cu.usbmodem...
arduino-cli monitor -p /dev/cu.usbmodem... -c baudrate=115200
```

The serial log should report firmware `v4`, successful SGP41 conditioning, VOC
and NOx raw signals, and an OTAA join. If an SHT41 is connected, it should also
report its values and use them for compensation. Check the
decoded uplink in TTN and the stored data in the backend. Keep the EU868 antenna
connected during radio operation. The current development gateway is
single-channel and is only suitable for bring-up.
