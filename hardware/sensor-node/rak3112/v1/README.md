# RAK3112 / RAK3212 bring-up

This sketch targets the RAK3112 module on the RAK3212 breakout, not the Heltec
board used by `hardware/sensor-node/v1`.

## First USB and radio check

The sketch starts at 115200 baud, prints ESP32-S3/flash details, and initializes
the internal SX1262 on the RAK3112 pin map. Without a local `secrets.h` it stops
before OTAA and does not transmit. Keep the EU868 LoRa antenna attached during
all radio tests.

With Arduino CLI and the RadioLib library installed:

```sh
arduino-cli compile --fqbn 'esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,FlashSize=16M,PSRAM=opi' hardware/sensor-node/rak3112/v1
arduino-cli upload -p /dev/cu.usbmodem11101 --fqbn 'esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,FlashSize=16M,PSRAM=opi' hardware/sensor-node/rak3112/v1
arduino-cli monitor -p /dev/cu.usbmodem11101 -c baudrate=115200
```

The ESP32-S3 core must be configured for the RAK3112's 16 MB flash and OPI
PSRAM. The sketch uses the module's internal radio pins: NSS 7, SCK 5, MOSI 6,
MISO 3, RESET 8, DIO1 47, BUSY 48. RF switching is handled through SX1262
DIO2; the TCXO is enabled at 1.6 V via DIO3.

## Enable TTN OTAA

Copy `../device-profile.example.h` to
`../profiles/<ttn-device-id>.h`, enter that device's credentials, then build
with `../build.sh v1 <ttn-device-id>`. The helper selects this device's
git-ignored local profile and injects it into a temporary copy. Select LoRaWAN
Specification 1.1.0 in TTN:
this sketch uses RadioLib's 1.1 OTAA path and needs separate NwkKey and AppKey.
An all-zero JoinEUI is accepted for a DIY device. For the experimental
single-channel Heltec gateway, select `Europe 868.1 MHz` as the device frequency
plan and disable ADR under the device's Network Layer advanced MAC settings.
The sketch restricts its EU868 default channels to 868.1 MHz and fixes the node
at DR5 (SF7), matching the custom gateway's single frequency and data rate.
This is only a development configuration; use a normal multi-channel EU868
gateway before relying on the node for regular LoRaWAN operation. The RAK3112's
datasheet also describes its optional built-in modem stack as 1.0.2, but this
sketch runs RadioLib directly on the ESP32-S3 and SX1262.

After OTAA succeeds, the sketch sends an unconfirmed uplink on FPort 10
immediately and then every five minutes. Firmware v1 sends payload format v3:
a format byte followed by one five-byte record for each measurement. The
shared TTN formatter in this directory also accepts format v4 from firmware
v2; v4 adds three semantic firmware version bytes after the format byte.

| Record byte(s) | Meaning | Encoding |
| --- | --- | --- |
| 0 | Payload format version (`3`) | unsigned byte |
| 1 | Metric code | unsigned byte |
| 2–5 | Metric value | signed 32-bit, big-endian |

Records repeat until the end of the payload. Metric codes are stable protocol
identifiers; the value scale and unit belong to each code:

| Code | Metric | Unit | Integer scale |
| --- | --- | --- | --- |
| 1 | `temperature` | `°C` | tenths (raw `187` = `18.7`) |
| 2 | `humidity` | `%` | tenths (raw `503` = `50.3`) |
| 3 | `uv_index` | `index` | hundredths (raw `725` = `7.25`) |
| 4 | `co2` | `ppm` | whole ppm (raw `420` = `420`) |
| 5 | `scd41_temperature` | `°C` | hundredths |
| 6 | `scd41_humidity` | `%` | hundredths |
| 7 | `sound_level` | `dBFS` | tenths; digital level relative to full scale |
| 8–11 | `pm1_0`, `pm2_5`, `pm4_0`, `pm10` | `µg/m³` | tenths |
| 12–16 | `particle_number_pm0_5`, `particle_number_pm1_0`, `particle_number_pm2_5`, `particle_number_pm4_0`, `particle_number_pm10` | `#/cm³` | tenths |
| 17 | `particle_size_typical` | `nm` | whole nm |
| 18 | `bme688_temperature` | `°C` | hundredths |
| 19 | `bme688_humidity` | `%` | hundredths |
| 20 | `pressure` | `hPa` | tenths |
| 21 | `bme688_gas_resistance` | `Ω` | whole ohms |
| 22–23 | `bme688_iaq`, `bme688_static_iaq` | `index` | tenths |
| 24 | `bme688_co2_equivalent` | `ppm` | whole ppm (algorithm estimate, not NDIR CO₂) |
| 25 | `bme688_bvoc_equivalent` | `ppm` | hundredths |
| 26 | `bme688_gas_percentage` | `%` | tenths |
| 27–28 | retired SGP41 raw-signal codes | — | discarded by the formatter; not forwarded |
| 29–30 | `sgp41_voc_index`, `sgp41_nox_index` | `index` | whole index |
| 31 | `ambient_light` | `lux` | tenths |
| 32–33 | `ltr390_uv_raw`, `ltr390_als_raw` | `raw` | whole ADC signal |
| 34 | `rain_detected` | `bool` | `0` = no, `1` = yes |
| 35 | `rain_pulses` | `count` | whole pulses |
| 36 | `bus_voltage` | `mV` | whole mV |
| 37 | `shunt_voltage` | `µV` | whole µV |
| 38 | `current` | `mA` | whole mA |
| 39 | `power` | `mW` | whole mW |
| 40 | `sound_dominant_frequency` | `Hz` | whole Hz |
| 41 | `sound_event_class` | `class` | Reserved in the decoder; no current firmware emits it and no class-ID mapping is active |

Codes 5–40 cover optional outputs from the sensor selection in
`hardware/sensor-node/v2/bom.md`; firmware versions add support as sensors are
integrated. RAK3112 firmware v8 emits LTR390 UV index, ambient-light lux, and
the underlying UV/ALS raw counts. The sound metrics require DSP/ML on microphone
samples; `sound_level` is uncalibrated dBFS, not dB SPL or dB(A). Code 41's
earlier example mapping is retired; see [`../audio-event-ml-plan.md`](../audio-event-ml-plan.md)
for the proposed versioned multi-label taxonomy and next payload contract.
BME688 IAQ/equivalent-gas fields require a
supporting algorithm, rain pulses do not become millimetres until calibrated,
and INA226 current depends on the configured shunt. Formats 3/4 contain at
most 41 five-byte records; format 5 uses four-byte tagged 24-bit records and is
limited to 222 bytes by the current firmware. Keep each uplink within the
active LoRaWAN data-rate payload allowance.

To add a measurement, assign it a new code and documented scale, append its
encoded value to the uplink records, and add that code to
`payload-formatter.js`. Until a code is registered, the formatter still sends
it downstream as `metric_<code>` with unit `raw`, and also exposes the raw
code/value pair as `unknown_measurements`. Retired SGP41 codes 27 and 28 are
explicitly discarded. The formatter accepts payload formats 3, 4 and 5.
Format 4 exposes the semantic firmware version as `firmware_version` metadata,
separate from `measurements`. Format 5 adds a window duration and structured
minimum/mean/maximum/sample-count statistics; its `measurements` array still
contains one mean per metric for compatible database and chart ingestion. The
RAK3112 v11 sampling and format-5 contract are documented in `../v11/README.md`.
The formatter does not expose the removed uptime or uplink-counter diagnostics.

Install `payload-formatter.js` as the TTN uplink payload formatter for FPort 10.
Its local protocol tests can be run with:

```sh
node --test hardware/sensor-node/rak3112/v1/payload-formatter.test.mjs
```

The LoRaWAN session and DevNonce/JoinNonce state are stored separately in ESP32
NVS to avoid invalid rejoins after reset.
