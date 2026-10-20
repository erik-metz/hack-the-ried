# RAK3112 environmental firmware v10

Firmware v10 extends v9 with an ICS-43434 digital I2S microphone on the RAK3112 / RAK3212.
Existing I2C environmental sensors and the LoRaWAN payload remain supported.

## Microphone wiring

| ICS-43434 | RAK3112 GPIO |
| --- | --- |
| SD (data out; the module photo may label it `SD`) | GPIO10 |
| SCK / BCLK | GPIO11 |
| WS / LRCLK | GPIO12 |
| L/R | VCC (HIGH selects the right I2S slot) |
| VDD | 3.3 V |
| GND | GND |

The sketch captures 256 stereo frames at 16 kHz with 32-bit I2S slots once per second,
uses the right slot selected by L/R=HIGH, and calculates an RMS digital level. It prints
the result on USB serial and includes metric 7 (`sound_level`) in the regular telemetry
uplink. The value is dBFS (tenths) and is not an acoustically calibrated dB SPL reading.
The sketch does not save or transmit raw audio and does not yet perform event detection.

On startup, the serial log reports whether the I2S RX channel initialized. At 115200 baud,
look for `[I2S-MIC] bereit` and then one `[I2S-MIC] RMS-Pegel=... dBFS` line each second.
If initialization fails, check wiring and confirm the microphone is powered from 3.3 V.

## Build and flash

```sh
./hardware/sensor-node/rak3112/build.sh v10 <device-profile-id>
./hardware/sensor-node/rak3112/build.sh v10 <device-profile-id> --port /dev/cu.usbmodem11101
arduino-cli monitor -p /dev/cu.usbmodem11101 -c baudrate=115200
```

Metric 7 is already defined in the shared TTN payload formatter as `sound_level` in dBFS;
no payload-format change is required. Firmware v10 continues using payload format 4.
