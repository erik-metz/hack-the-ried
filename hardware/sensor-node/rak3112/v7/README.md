# RAK3112 SHT41 + SGP41 + SCD41 firmware v7

Firmware v7 adds support for the Sensirion SCD41 CO₂ sensor while keeping
SHT41 and SGP41 on-device Gas Index processing. All three sensors share the
RAK3212 I²C bus:

| Sensor | Signal | RAK3112 GPIO | I²C address |
| --- | --- | --- | --- |
| SHT41 | SDA | IO14 | `0x44` |
| SHT41 | SCL | IO13 | `0x44` |
| SGP41 | SDA | IO14 | `0x59` |
| SGP41 | SCL | IO13 | `0x59` |
| SCD41 | SDA | IO14 | `0x62` |
| SCD41 | SCL | IO13 | `0x62` |

The RAK scans the I²C bus at boot to log detected sensors. It runs the SCD41 in
periodic measurement mode (5 s cadence), reading CO₂ concentration (ppm),
temperature, and relative humidity.

Temperature and humidity from the SHT41 (or fallback from the SCD41 if SHT41 is
absent) compensate the SGP41 VOC/NOx algorithms.

## Uplink measurements

The v4 payload format remains unchanged; the firmware version header is `7`.
When sensors are available, an uplink contains:

| Metric code | Metric | Unit | Meaning |
| --- | --- | --- | --- |
| 1 | `temperature` | `°C` | SHT41 (or SCD41 fallback), tenths |
| 2 | `humidity` | `%` | SHT41 (or SCD41 fallback), tenths |
| 4 | `co2` | `ppm` | Sensirion SCD41 CO₂ concentration |
| 5 | `scd41_temperature` | `°C` | Sensirion SCD41 internal temperature, hundredths |
| 6 | `scd41_humidity` | `%` | Sensirion SCD41 internal humidity, hundredths |
| 29 | `sgp41_voc_index` | `index` | Sensirion VOC Index |
| 30 | `sgp41_nox_index` | `index` | Sensirion NOx Index |

## Build and flash

```sh
./hardware/sensor-node/rak3112/build.sh v7 <ttn-device-id>
./hardware/sensor-node/rak3112/build.sh v7 <ttn-device-id> --port /dev/cu.usbmodem...
```
