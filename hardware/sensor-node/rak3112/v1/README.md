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

Copy `secrets.h.example` to `secrets.h` in this directory and enter the new
device's JoinEUI, DevEUI, NwkKey, and AppKey from TTN. The repository ignores
files named `secrets.h`. Select LoRaWAN Specification 1.1.0 in TTN: this sketch
uses RadioLib's 1.1 OTAA path and needs the separate NwkKey and AppKey. The
RAK3112's datasheet also describes its optional built-in modem stack as 1.0.2,
but this sketch runs RadioLib directly on the ESP32-S3 and SX1262.

After OTAA succeeds, the sketch sends a 7-byte unconfirmed uplink on FPort 10
immediately and then every five minutes. Payload v1 is:

| Byte(s) | Meaning | Encoding |
| --- | --- | --- |
| 0 | Payload version (`1`) | unsigned byte |
| 1–4 | Uptime seconds | unsigned 32-bit, big-endian |
| 5–6 | Uplink counter | unsigned 16-bit, big-endian |

The LoRaWAN session and nonce state are stored in ESP32 NVS to avoid invalid
rejoins after reset. Register a TTN payload formatter if you want named fields
in Live Data; the raw bytes are sufficient to verify the first uplink.
