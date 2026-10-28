# RAK3112 / RAK3212 firmware v13 — compact telemetry

TTN uplink decoder for this firmware: [`payload-formatter.js`](payload-formatter.js).
Install this file in TTN before flashing this firmware.

v13 retains the v12 sensors, sampling, five-minute windows and audio classifier.
It replaces format-6 TLVs with **format 7**, reducing the full 26-metric sensor
summary from **257 to 165 bytes** (35.8%) without changing scales, sensor values,
sample counts, or the statistics previously transmitted. The SPS30's ten channels
and the LTR390's two raw diagnostic channels remain mean-only; all other emitted
metrics retain minimum, mean and maximum. No names or units travel over LoRaWAN.
The shared TTN decoder reconstructs the existing API/DB/frontend JSON contract.

## Deployment order

1. Install `payload-formatter.js` in the TTN application (or device override)
   uplink formatter on FPort 10 **before flashing v13**. It continues to decode
   deployed formats 3–6 as well as format 7.
2. Run the protocol tests and build/upload with the actual device's profile:

   ```sh
   node --test hardware/sensor-node/rak3112/v1/*test.mjs
   ./hardware/sensor-node/rak3112/build.sh v13 rak3112-002
   ./hardware/sensor-node/rak3112/build.sh v13 rak3112-002 --port /dev/cu.usbmodem1101
   arduino-cli monitor -p /dev/cu.usbmodem1101 -c baudrate=115200
   ```

3. Confirm `Format=7, firmware=v13, Messgroessen=26` and `payload=165 Byte`
   without audio events, followed by successful transmission. A restored TTN
   session alone does not prove delivery. Verify format-7 decoded measurements
   and successful webhook delivery in TTN, then fresh timestamps in
   `/api/v1/telemetry/latest/metrics?sensor_id=ttn-rak3112-002` and the frontend.

The upload preserves NVS session/nonces. A new decoder is required in TTN;
committing the formatter to GitHub does not deploy it to TTN automatically.

## Format-7 wire contract

All multibyte numbers are big-endian. The maximum application buffer is 222
bytes, as in v12. The radio's actual data-rate-dependent limit still applies.

| Offset | Bytes | Meaning |
| --- | ---: | --- |
| 0 | 1 | Format: 7 |
| 1 | 1 | Firmware: 13 |
| 2 | 3 | Window seconds, 1–16,777,215 |
| 5 | 6 | Present metrics bitmap |
| 11 | 6 | Wide metrics bitmap (must be a subset of presence) |
| 17 | variable | Present metric values in ascending metric-code order |
| after values | 3 per present group | Sample counts, ascending group 1–9; no group tags |
| after counts | 3 per audio event | ESC-50 class ID, count (1–255), max score (0–100 percent) |

In each bitmap, metric code `c` uses byte `(c-1)/8`, bit `(c-1)%8`, least
significant bit first. Unsupported/reserved bits must be zero. Presence is per
metric, so partial startup windows and missing sensors cannot shift other fields.
Groups are inferred from the present metrics; each count is their maximum count,
matching the previous format. A sample count of zero or above uint24 is rejected
by the encoder rather than wrapped. Failed sensor encoding or radio transmission
restores the pending window and audio snapshot for a later attempt.

| Metric codes | Default encoding | Statistics | Group |
| --- | --- | --- | --- |
| 1 (SHT temperature) | int16, 0.1 °C | min/mean/max | 1 |
| 2 (SHT humidity) | uint16, 0.1 % | min/mean/max | 1 |
| 3 (UV index) | uint16, 0.01 | min/mean/max | 4 |
| 4 (CO₂) | uint16, ppm | min/mean/max | 2 |
| 5 (SCD temperature) | int16, 0.01 °C | min/mean/max | 2 |
| 6 (SCD humidity) | uint16, 0.01 % | min/mean/max | 2 |
| 7 (microphone level) | int16, 0.1 dBFS | min/energy mean/max | 8 |
| 8–11 (PM mass) | uint16, 0.1 µg/m³ | mean | 9 |
| 12–16 (particle number) | uint24, 0.1 #/cm³ | mean | 9 |
| 17 (particle size) | uint16, 0.1 µm | mean | 9 |
| 18 (BME temperature) | int16, 0.01 °C | min/mean/max | 6 |
| 19 (BME humidity) | uint16, 0.01 % | min/mean/max | 6 |
| 20 (pressure) | uint16, 0.1 hPa | min/mean/max | 6 |
| 21 (BME gas resistance) | uint24, Ω | min/mean/max | 7 |
| 29–30 (VOC/NOx indices) | uint16, index | min/mean/max | 3 |
| 31 (light) | uint24, 0.1 lux | min/mean/max | 5 |
| 32 (UV raw) | uint24, raw | mean | 4 |
| 33 (ALS raw) | uint24, raw | mean | 5 |

If any transmitted statistic exceeds its default field range, the wide bitmap
selects **signed int32 for every transmitted statistic of that metric**, keeping
its scale and integer values exactly. It never silently clips or changes units.
The 165-byte baseline assumes no wide fields. Wide fields consume extra bytes;
an over-capacity sensor summary is rejected and retained, not partly transmitted.

At the baseline size, 57 bytes remain for **19 audio classes**. As in v12, audio
records are bounded by remaining payload capacity and counts are capped at 255;
classes beyond that budget are not transmitted. Audio still has the experimental
classification limitations documented in `../v12/README.md`. No raw audio is sent.
The BME688 emits temperature/humidity/pressure/gas resistance, not BSEC IAQ or
CO₂-equivalent estimates.

## Verification

`compact_payload_fixture.cpp` compiles the actual Arduino encoder as portable
C++11. Node tests feed it realistic and boundary windows, pass its bytes through
the TTN decoder, and compare every field with the legacy decoder. Cases cover all
26 channels, missing sensors, uint24 counts, signed values, int32 overflow escape,
full audio capacity, truncation and malformed masks. The old decoder regression
tests remain in place. The full Arduino build additionally checks ESP32 integration.

Model, audio taxonomy, sensor pinout and licensing are unchanged from v12; the
model and its original license files are included alongside the firmware.
