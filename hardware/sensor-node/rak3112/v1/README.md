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

Copy `secrets.h.example` to `secrets.h` in this directory. Paste the TTN
JoinEUI and DevEUI as 16-character hexadecimal strings, and the NwkKey and
AppKey as 32-character hexadecimal strings. The sketch parses them at startup;
you do not need to convert them to integers or byte arrays. The repository
ignores files named `secrets.h`. Select LoRaWAN Specification 1.1.0 in TTN:
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
immediately and then every five minutes. The current payload v3 is a version
byte followed by one five-byte record for each measurement:

| Record byte(s) | Meaning | Encoding |
| --- | --- | --- |
| 0 | Payload version (`3`) | unsigned byte |
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

To add a measurement, assign it a new code and documented scale, append its
encoded value to the uplink records, and add that code to
`payload-formatter.js`. Until a code is registered, the formatter still sends
it downstream as `metric_<code>` with unit `raw`, and also exposes the raw
code/value pair as `unknown_measurements`. The formatter accepts the previous
fixed five-byte v2 temperature/humidity payload during firmware migration. It
does not expose the removed uptime or uplink-counter diagnostics.

Install `payload-formatter.js` as the TTN uplink payload formatter for FPort 10.
Its local protocol tests can be run with:

```sh
node --test hardware/sensor-node/rak3112/v1/payload-formatter.test.mjs
```

The LoRaWAN session and DevNonce/JoinNonce state are stored separately in ESP32
NVS to avoid invalid rejoins after reset.
