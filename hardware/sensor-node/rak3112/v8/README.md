# RAK3112 SHT41 + SGP41 + SCD41 + LTR390 firmware v8

TTN uplink decoder for this firmware: [`payload-formatter.js`](payload-formatter.js).
Install this file in TTN before flashing this firmware.

Firmware v8 adds the LTR390 UV and ambient-light sensor to v7. The sensors
share the RAK3212 I²C bus (SDA GPIO14, SCL GPIO13):

| Sensor | Address | Measurements |
| --- | --- | --- |
| SHT41 | `0x44` | Temperature and relative humidity |
| SGP41 | `0x59` | VOC and NOx indices |
| SCD41 | `0x62` | CO₂, temperature and relative humidity |
| LTR390 | `0x53` | UV index and ambient light |

The firmware verifies the LTR390 part ID, configures 18-bit resolution,
100 ms integration and 3x gain, then alternates ALS and UV mode once per
second because both channels share the sensor ADC. New-data status is checked
before reading each 24-bit result. The I²C scan labels address `0x53` as
LTR390, and serial output reports both raw counts and derived values.

## LTR390 payload measurements

The existing format-4 TLV payload and TTN decoder are unchanged. Firmware
version metadata is `8`.

| Code | Metric | Unit | Encoding |
| --- | --- | --- | --- |
| 3 | `uv_index` | `index` | hundredths |
| 31 | `ambient_light` | `lux` | tenths |
| 32 | `ltr390_uv_raw` | `raw` | whole UV ADC counts |
| 33 | `ltr390_als_raw` | `raw` | whole ALS ADC counts |

The UVI conversion normalizes the datasheet sensitivity of 2300 counts per UVI
at 18x gain / 400 ms to the configured 3x / 100 ms settings. Lux uses the
datasheet formula `0.6 × ALS_DATA / (gain × integration factor)` with a clear
window factor of 1. Optical-window attenuation and final installed-system
accuracy are not calibrated, so the raw channels are retained for validation.

The backend ingests these registered metrics through the existing TTN uplink
path. The frontend labels the UVI/lux series, exposes raw channels, and places
LTR390 readings in the weather category.

## Build and flash

```sh
./hardware/sensor-node/rak3112/build.sh v8 <ttn-device-id>
./hardware/sensor-node/rak3112/build.sh v8 <ttn-device-id> --port /dev/cu.usbmodem11101
arduino-cli monitor -p /dev/cu.usbmodem11101 -c baudrate=115200
```

The serial log should show `[I2C] Geraet gefunden auf 0x53 (LTR390)`, a valid
`[LTR390] Bereit` line, alternating ALS/UV samples, and a LoRaWAN uplink listing
codes 3, 31, 32 and 33. Existing profiles and the stored LoRaWAN session remain
per-device; never put live credentials in tracked files.
