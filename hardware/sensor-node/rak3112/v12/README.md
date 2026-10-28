# RAK3112 Umweltstation — Firmware v12 audio-ML prototype

TTN uplink decoder for this firmware: [`payload-formatter.js`](payload-formatter.js).
Install this file in TTN before flashing this firmware.

Firmware v12 adds local audio classification to v11 using the quantized
ACDNet20 ESC-50 fold-4 model and Espressif's TFLite Micro runtime. It captures
the existing ICS-43434 I²S stream at 16 kHz and builds temporary 1.51-second
mono windows in PSRAM. An RMS silence gate (threshold -36 dBFS) drops quiet
windows before preprocessing/inference to prevent false positives and conserve CPU/power.
Active windows are resampled to 20 kHz and classified; predictions above confidence
threshold (0.35) are accumulated in a 5-minute event histogram and transmitted
in LoRaWAN Payload Format 6. During quiet windows without sound events, 0 extra bytes
are appended to the payload. Raw audio is never stored or transmitted.

The firmware also reads an optional Sensirion SPS30 over the shared 100 kHz I²C
bus (SDA GPIO14, SCL GPIO13, address `0x69`). It starts particulate measurement
in IEEE754 mode, validates the SPS30 CRC on every received word, and samples all
10 outputs every five seconds. The four PM mass concentrations and five particle
number concentrations and typical particle size are sent as five-minute window
means with 0.1-unit resolution (`µg/m³`, `#/cm³`, and `µm`, respectively). The SPS30 group
shares its sample count across the ten readings. The first periodic uplink waits for an SPS30 sample
when the sensor is detected. Connect the SPS30 in I²C mode with its SEL pin low
at power-up and provide its specified 5 V supply.

## Model and limits

- Model: ACDNet20, ESC-50 fold 4, post-training INT8; model file is
  `acdnet20_esc50_fold4_int8.tflite` (156,288 bytes, SHA-256
  `72f96b3475f5011132f9ab696854f3803228f217e0b56e45a96a9506d8fb3c5e`).
- Inputs are 30,225 signed audio samples at 20 kHz; firmware linearly
  resamples 24,180 captured samples at 16 kHz and quantizes with the model's
  input scale/zero point.
- Outputs are 50 ESC-50 single-label classes. The top-three scores are
  quantized softmax outputs and are not calibrated confidence estimates.
  The model always chooses among its 50 labels; it has no `unknown`, silence,
  or multi-label output.
- The model was trained on ESC-50 clips, not on Ried streets or this exact
  microphone/enclosure. It is a hardware bring-up baseline, not a validated
  city-sound detector. The quiet-room check repeatedly returned labels such
  as `mouse_click` and `fireworks`; treat them as false positives until
  tested with representative, labelled audio.
- ESC-50 is licensed CC BY-NC 3.0; the ACDNet repository is MIT licensed.
  See [`ESC-50-LICENSE.txt`](ESC-50-LICENSE.txt) and
  [`ACDNet-LICENSE.txt`](ACDNet-LICENSE.txt). This checkpoint is for the
  project's non-commercial prototype. Review dataset/model rights before a
  commercial deployment or redistribution outside that scope.

Sources: [ACDNet model/repository](https://github.com/mohaimenz/acdnet),
[ACDNet paper](https://arxiv.org/abs/2103.03483), and
[ESC-50 dataset and class mapping](https://github.com/karoldvl/ESC-50).

The taxonomy and contract for eventual multi-label HackTheRied events are
in [`../audio-event-ml-plan.md`](../audio-event-ml-plan.md). Format 6 encodes
the 5-minute event counts as 4-byte TLVs (`tag=3, code=58`); TTN decodes them into
`sound_events` and the VPS webhook writes them as canonical interval statistics
into `readings` (`sound_event_count`).

SPS30 measurements use metric codes 8–17. Their shared window sample count is
the Format 5/6 TLV `tag=3, code=59`; code 58 remains reserved for Format 6 sound
events. The TTN decoder scales these into PM mass (`µg/m³`), particle number
(`#/cm³`), and typical size (`nm`) measurements for the existing webhook and
frontend API path.

## RAK3112 resource measurement

Measured on the connected RAK3112 / ESP32-S3, firmware v12, profile
`rak3112_002`, with the board powered through USB:

| Resource | Measured result |
| --- | ---: |
| CPU | ESP32-S3, 240 MHz, dual core |
| Flash / PSRAM fitted | 16 MB / 8 MB OPI |
| Firmware program | 678,138 bytes (51% of the 1,310,720-byte app partition); binary 678,288 bytes |
| Static globals | 28,788 bytes |
| Free internal heap at boot | 336,468 bytes |
| Free internal heap during inference | about 293,308 bytes |
| Model tensor arena used | 373,276 bytes in a 768 KiB PSRAM allocation |
| Free PSRAM after model setup | about 7,483,316 bytes |
| Capture buffers | two 24,180-sample `int16_t` windows in PSRAM (96,720 bytes total) |
| Preprocessing per 1.51 s window | 20–21 ms |
| TFLite Micro inference | 264–266 ms per window |
| Microphone capture | about 63 I²S blocks/s, no dropped samples in the observed 70 s run |
| Inference-task stack high-water mark | 13,692 bytes remaining from a 16 KiB stack |

At one non-overlapping inference per 1.51-second window, preprocessing plus
inference occupied about 19% of the inference core's window time in this run.
The serial duty summary counts only model invocation time against boot time.
This is a CPU-time proxy, not an electrical energy measurement. No current or
power meter was connected, so mA, watts, and joules per classification remain
unmeasured. Use an inline USB power meter or a current-sense instrument for
that measurement.

The existing LoRaWAN session survived the upload, rejoined as `joined=yes`,
and sent an ordinary format-5 sensor report. The bootloader, partition table
and app were rewritten; the NVS partition containing the session/nonces was
not written by this upload.

## Build, flash, and inspect

The ESP32 Arduino core must include Espressif TFLite Micro / ESP-NN (tested
with core 3.3.11):

```sh
./hardware/sensor-node/rak3112/build.sh v12 rak3112_002
./hardware/sensor-node/rak3112/build.sh v12 rak3112_002 --port /dev/cu.usbmodem1101
arduino-cli monitor -p /dev/cu.usbmodem1101 -c baudrate=115200
```

Look for `[AUDIO-ML] bereit` at boot and subsequent `[AUDIO-ML] #...` lines.
Each line includes the three top labels and scores, preprocessing/inference
time, remaining internal heap/PSRAM, stack high-water mark and dropped-sample
count. Raw audio remains only in two volatile PSRAM windows and is overwritten
as new windows arrive.
