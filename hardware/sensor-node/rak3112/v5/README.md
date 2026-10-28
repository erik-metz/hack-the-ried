# RAK3112 SHT41 + SGP41 firmware v5

TTN uplink decoder for this firmware: [`payload-formatter.js`](payload-formatter.js).
Install this file in TTN before flashing this firmware.

Firmware v5 runs Sensirion's Gas Index Algorithm on the RAK3112 while keeping
v4 unchanged. Both sensors share the RAK3212 I²C bus:

| Sensor | Signal | RAK3112 GPIO | I²C address |
| --- | --- | --- | --- |
| SHT41 | SDA | IO14 | `0x44` |
| SHT41 | SCL | IO13 | `0x44` |
| SGP41 | SDA | IO14 | `0x59` |
| SGP41 | SCL | IO13 | `0x59` |

The RAK reads temperature and relative humidity from the SHT41 once per
second and passes them to the SGP41 as compensation values. If the SHT41 is
absent or fails, the SGP41 uses its documented default compensation values
(50 % RH / 25 °C); the RAK still reports the SHT41 error.

The SGP41 runs its 10-second NOx conditioning sequence, then the RAK samples
its raw VOC and NOx signals every second. Separate VOC and NOx instances of
Sensirion's Gas Index Algorithm v3.2.0 process those readings at that cadence.
The algorithm starts fresh after a reboot and has an initial blackout; the
first uplink is delayed until both calculated indices are positive. Later
uplinks follow the normal five-minute interval. This avoids sending zero
startup indices as if they were valid readings.

## Uplink measurements

The v4 payload format remains unchanged; the firmware version header is `5`.
When both sensors are available, one uplink contains:

| Metric code | Metric | Unit | Meaning |
| --- | --- | --- | --- |
| 1 | `temperature` | `°C` | SHT41, tenths |
| 2 | `humidity` | `%` | SHT41, tenths |
| 27 | `sgp41_voc_raw` | `raw` | SGP41 compensated raw signal |
| 28 | `sgp41_nox_raw` | `raw` | SGP41 compensated raw signal |
| 29 | `sgp41_voc_index` | `index` | Sensirion VOC Index |
| 30 | `sgp41_nox_index` | `index` | Sensirion NOx Index |

Raw signals are retained for diagnostics. The indices are relative air-quality
signals, not concentrations in ppm. The algorithm uses only SHT41 readings to
compensate the SGP41 sensor command; the algorithm itself processes the
compensated raw VOC/NOx readings.

The upstream algorithm is vendored from Sensirion's
[gas-index-algorithm](https://github.com/Sensirion/gas-index-algorithm),
commit `2ef9f13d225e8a0dedd3ff42dd229af4dbb1aae4`. Its BSD-3-Clause license is
included in `SENSIRION-LICENSE.txt`; copyright headers remain in the vendored
source files.

## Build and flash

Use the matching local TTN device profile and verify the printed DevEUI before
flashing. The build helper injects secrets into a temporary copy; no keys are
stored in this firmware folder. Install RadioLib 7.8.1 in the Arduino Library
Manager, or set `RAK3112_ARDUINO_LIBRARIES_DIR` to a folder containing RadioLib.

```sh
./hardware/sensor-node/rak3112/build.sh v5 <ttn-device-id>
./hardware/sensor-node/rak3112/build.sh v5 <ttn-device-id> --port /dev/cu.usbmodem...
arduino-cli monitor -p /dev/cu.usbmodem... -c baudrate=115200
```

The serial log should show both sensors recognized, successful SGP41
conditioning, nonzero VOC/NOx indices after algorithm startup, and a six-metric
uplink. Verify the decoded metrics in TTN Live Data and the stored readings in
the backend. Keep the EU868 antenna connected during radio operation.
