# Heltec V4.3 TTN GPS tracker, lab v1

This is the end-device replacement for the connected Heltec WiFi LoRa 32 V4.3
(MAC F8:5B:1B:A1:75:D8, ESP32-S3R2, 16 MB flash, 2 MB QSPI PSRAM). The original
`hardware/dev-gateway/v1` source remains unchanged. It has no gateway/UDP/WiFi
forwarding role: normal position telemetry joins TTN using the original device
identity; private update feedback uses an independent identity.

## Plan and bring-up

All four implementation steps below were completed on 2026-11-08; see the
[hardware and TTN evidence](TEST-2026-11-08.md). The additional real radio-update
acceptance also [passed on November 10](TEST-2026-11-10-FUOTA.md). Current scope
and remaining field measurements are in the [plan review](PLAN-REVIEW-2026-11-10.md).

1. **Completed:** Identify the USB MAC; back up the complete gateway flash locally, retaining
   NVS and credentials privately. The ignored recovery artifact is
   `../build/recovery/gateway-original.bin`, SHA256
   `5cd26a5f41664f1a7a247658fb2086a8890f400edd1112d140bf9e31545e5205`.
2. **Completed:** Build this separate end-device version; test the real C++ payload encoder
   against the local TTN decoder. The two-partition layout supports later OTA.
3. **Completed:** Install the [device-level TTN formatter](payload-formatter.js), build and
   flash the exact identified board, provision its identity over USB, and add
   its separate companion to the Pi router and isolated Heltec multicast group.
4. **Completed:** Verify OLED initialization, valid GPS sentences, a fresh satellite fix,
   TTN application reception, and private activation separately. Without sky
   reception a real GPS position remains unverified. Do not invent coordinates.

## Hardware

Uses SX1262 NSS8/DIO1 14/RESET12/BUSY13, SPI SCK9/MISO11/MOSI10, TCXO 1.8 V.
VEXT36 LOW powers OLED; SDA17/SCL18/RESET21 drive the SSD1306. Battery ADC1 is
enabled by GPIO37; displayed voltage is approximate and uses the board divider.
GNSS enable34 LOW, wake40 HIGH and reset42 LOW pulse are separate from the FEM.
Default UART RX39/TX38 at 9600 follows the V4 expansion module pin definitions;
if no checksum-valid NMEA arrives, the receiver probes the swapped UART pair
and 115200. Once valid sentences arrive, it leaves the configuration alone,
even when satellites have not provided a fix yet. GPS parsing runs in its own
task during blocking LoRaWAN RX windows; shared samples are protected by a mutex.

KCT8103L FEM supply7, CSD2 and CTX5 use RadioLib's RX/TX switching table, plus
automatic DIO2. This avoids leaving the amplifier in transmit mode while waiting
for a downlink. The output-power override accounts for Heltec's 13 dB low-drive
net gain and caps nominal output at 14 dBm even if MAC commands request more.
RF output has not been calibrated with a power meter.

Primary hardware references:
- [Heltec V4 overview and FEM revision selection](https://wiki.heltec.org/docs/devices/open-source-hardware/esp32-series/lora-32/wifi-lora-32-v4/)
- [Heltec KCT8103L conversion table, PR 226](https://github.com/HelTecAutomation/Heltec_ESP32/pull/226)
- [V4 board and expansion GNSS definitions](https://github.com/meshtastic/firmware/blob/develop/variants/esp32s3/heltec_v4/variant.h)

## Build and USB identity

Dependencies: ESP32 Arduino 3.3.11, RadioLib 7.7.1, TinyGPSPlus, Adafruit GFX,
Adafruit SSD1306. Build from the repo root with
`python3 hardware/sensor-node/heltec-v4/build.py --firmware 1` (or 2).
The helper copies the shared, tested lab OTA receiver and USB identity loader
into a temporary build; neither credentials nor profile headers enter the image.
Use the printed output folder for `arduino-cli upload` with FQBN
`esp32:esp32:esp32s3:USBMode=hwcdc,CDCOnBoot=cdc,FlashSize=16M,PSRAM=enabled`.
Never use the RAK OPI-PSRAM image on this board.

Use `provision.py --prepare-only` and then `provision.py --port <verified-port>`
from the parent directory. It reads the user-selected ignored local profile
`hardware/sensor-node/rak3112/profiles/heltec-v-001.h`; keys persist separately in
NVS and survive updates. Original DevEUI: `70B3D57ED0079D8B`; private companion:
`025D152A493EFC0D`. Do not erase NVS or reset LoRaWAN counters during recovery.
Do not restore a stale full-flash backup over a newer LoRaWAN security state.

## Payload and range-test behavior

TTN FPort44 contains 24 bytes, big-endian:
version1, flags1, application counter4, signed latitude4/longitude4 (degrees ×1e7),
signed altitude2 (metres), satellites1, HDOP2 (×100), battery2 (mV), fix age1 (s),
firmware1, lab test value1. Flags: position1, altitude2, HDOP4, battery8.
Coordinates/altitude are zeroed and omitted from decoded output unless a fix is
less than 10 seconds old. No-fix packets use age255. Missing readings are flagged,
never presented as a real (0,0) position. A true valid (0,0) fix remains possible.
The local formatter also handles shared private lab feedback on ports42/43.

Firmware version 2 (build with `--firmware 2`) sends a batched payload instead:
version2, fix mask1, application counter4, battery2, then 11 bytes per slot with
a fix (signed latitude4/longitude4, signed altitude2, satellites1), firmware1,
lab test value1. The five slots cover the previous four minutes and the current
position. Missing fixes are omitted from the byte stream and marked in the mask,
so a full packet is 65 bytes and a no-fix packet is 10 bytes. The formatter
reports each slot as `positions[]` with `offset_seconds` -240 to 0 and keeps the
latest fix mirrored at the top level. Position samples are taken every minute
and one packet is sent every five minutes, matching the existing cadence.

Normal telemetry is unconfirmed every five minutes; the first acquired fix
triggers one extra uplink. Initial TTN plan is 868.1 MHz/DR5 (SF7), matching the
existing test nodes and TTN profile. ADR is disabled for this moving range-test
baseline. This measures SF7 coverage, not maximum LoRaWAN coverage. The display
shows local TX success, not proof that TTN received it. Use TTN Live data and
its gateway RSSI/SNR for reception evidence. Follow TTN's
[fair-use airtime budget](https://thethingsnetwork.github.io/docs/lorawan/duty-cycle/)
when changing interval, payload or spreading factor.

This bench prototype keeps GPS, OLED and private Class-C reception on. Battery
runtime and low-power sleep are not yet validated; it is not an optimized
battery tracker. Production/backend payload formatters are not changed globally.

## Isolated private update path

Heltec and RAK images differ. Never place them in the same multicast update
group: a common A/B delta requires an exact matching base image on every member.
This board uses its own random group keys in `../build/private/group.json`.
Seal `registration.json` with the existing Pi public transfer key; decrypt only
on the Pi. Run `/lab3/tools.py /state/heltec-registration.json --gateway
98FE54FFFE63713B --group-name kamue-ttn-update-v3-heltec --group-state
/state/v3-heltec-group-id.json` through the existing tools container. Add only
its companion EUI to the router's private allowlist; the original DevEUI stays TTN.

Future same-board A/B transfers use `/lab3/send.py <bundle> --heltec --devices
025D152A493EFC0D`. Preserve exact A images. This setup reuses the lab protocol,
not standard TS003/TS004/TS005 FUOTA. The [actual Heltec radio-update test](TEST-2026-11-10-FUOTA.md)
verified the changed display, selected target partition and subsequent TTN GPS
reception. Existing RAK group keys, membership and counters must remain unchanged.

### Small display-only acceptance delta

If a newer GPS build is already installed, do not replace it with the old
bring-up image solely for an OTA demonstration. First read the running app
partition without erasing NVS and compare it byte-for-byte with its saved
application binary. `../display_delta.py` can then reuse that build's exact ELF
to change only `Heltec GPS v%u` to `Heltec OTA v%u`. It refuses an ambiguous title,
a mismatched ELF/base, an existing output directory, or a delta exceeding the
existing 16-block receiver limit. esptool regenerates all image digests.

```sh
python3 hardware/sensor-node/heltec-v4/display_delta.py \
  --elf hardware/sensor-node/heltec-v4/build/2/v1.ino.elf \
  --base hardware/sensor-node/heltec-v4/build/2/v1.ino.bin \
  --output hardware/sensor-node/heltec-v4/build/display-ota-NEW-SESSION \
  --esptool /absolute/path/to/esptool
```

This produces a fresh private bundle without rebuilding or changing the saved
base. Transfer it only through the isolated Heltec group and check its checksum
on the Pi before sending. This title-only test retains firmware2/value222, so a
version2 feedback packet alone cannot identify the new target. Independently
verify the changed OLED title and the selected app partition's exact target
hash after reboot, then verify actual TTN position reception separately.
