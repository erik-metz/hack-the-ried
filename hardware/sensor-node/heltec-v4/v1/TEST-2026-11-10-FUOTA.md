# Heltec real radio-update acceptance, 2026-11-10

Result: **passed**. The previously open Heltec FUOTA acceptance now has a real
private multicast transfer, independent active-partition verification, user
confirmation of the changed OLED title, and fresh TTN GPS reception afterward.
This supplements the [original bring-up](TEST-2026-11-08.md) and closes the
radio-update item in the [plan review](PLAN-REVIEW-2026-11-10.md).

## Exact base and target

The connected board was identified as Heltec MAC `F8:5B:1B:A1:75:D8`.
Read-only USB extraction before the transfer established that app partition0
at `0x10000` exactly matched the saved newer B image, 443088 bytes:

- Base SHA256: `e9cfed0ec80eb39e4b878e20defd8eb0f648f45fadf37a4110edabbd2fa59e85`.
- Target SHA256: `31cfa5bfde01f19101effcde932b6ae964d7b5a193691f7745f1259a647d2b99`.
- Bundle SHA256: `98b5dea489e2affcde84ea251d62e1ea027b9b264effe243fabb017bf1e2d1e1`.
- Fresh transfer session: `411052235`; changed 128-byte blocks: `[1,3,3461]`.

The [display-delta helper](../display_delta.py) first reproduced the original
binary byte-for-byte using its saved ELF and esptool5.3.1. It changed only the
three ELF bytes in the OLED title `Heltec GPS v%u` → `Heltec OTA v%u`; esptool
regenerated the ELF hash, image checksum and digest. The target's checksum and
image digest were validated before transfer. This retained the already-running
newer GPS/batched-payload behavior. No pending GPS source changes were staged.
Firmware2/value222 intentionally remained unchanged, so that version feedback
alone is not treated as proof of applying this particular target.

## Actual private radio transfer

Only the existing isolated Heltec group was selected:
`fcbed4d6-002b-47b9-b922-4c795973625e`, companion `025D152A493EFC0D`.
The RAK group and its members were not selected, rekeyed or reset.

The initial browser-transferred candidate failed the local/Pi checksum
comparison and was never sent. The corrected, separately named
`heltec-display-20261110-verified.json` matched the exact bundle hash above
before the sender was launched through the existing `fuota3` tools with
`send.py --heltec --devices 025D152A493EFC0D`.

The Pi sender log established:

1. Frame1 START: the Heltec accepted the exact base and reported receiving
   3459/3462 blocks, missing precisely `[1,3,3461]`.
2. Frames2–4 sent those three multicast blocks.
3. Frame5 STATUS: receiver Ready/state2, 3462/3462 blocks, no missing blocks.
4. Frame6 APPLY was sent. The board rebooted, the sender printed
   `VERIFIED ... firmware 2, value 222` and exited successfully. The independent
   checks below establish selection of this exact new image.

No repair wave was needed. The shell reported the background job as Done.
The log is retained on the Pi at
`/home/alpha/.local/share/kamue-fuota-v2/heltec-display-20261110.log` rather than
in temporary storage. This is the existing custom FPort43 lab protocol.

## Independent target and display verification

OTA selection records changed from sequence1/partition0 before transfer to a
new sequence2/state2 record selecting partition1 at `0x610000` afterward.
An attempted full read at 921600 baud failed with a serial-stream error; no
incomplete output was used as evidence. Read-only esptool `verify-flash` at
115200 baud then compared all 443088 bytes of partition1 against the exact
target binary and returned **Verification successful (digest matched)**.
The host target SHA256 is recorded above; this verification did not write it
over USB. No application/NVS image was flashed, erased or provisioned by USB
during this test. The inspection commands reset the device.

The user independently confirmed the visible OLED now reads
**Heltec OTA v2**. That visible change and selected-partition target comparison
resolve the ambiguity of unchanged firmware2/value222 feedback.

## Independent TTN reception after the radio reboot

The original TTN device `heltec-v4-001` in `my-gps-tracker-2026` continued using
DevAddr `260B9539` and FPort44, SF7BW125:

- **20:08:11.888428915 UTC:** forwarded new-boot uplink, counter0, firmware2,
  value222, no GPS fix yet; battery4.235 V, RSSI−43 dBm, SNR14.25 dB.
- **20:08:24.348059347 UTC:** forwarded fresh real GPS uplink, counter1,
  firmware2/value222, `gps_fix=true`, `fix_count=1`, seven satellites,
  altitude98 m, battery4.311 V, RSSI−43 dBm, SNR13.25 dB.
- **20:08:24.365168450 UTC:** TTN forwarded a location-solved message with
  GPS as its source. Exact coordinates and position bytes are omitted here.

These TTN events followed the actual radio-update reboot and preceded the
additional USB inspection resets. The user's later observation of GPS searching
after those resets does not invalidate the recorded successful post-update fix.
The existing webhook was disabled; backend ingestion was not part of this test.

The temporary TTN verification window was closed; the user's Pi shell was
retained. No sender remains running.

## Remaining scope

The original Heltec implementation and its extra real FUOTA acceptance are
complete. A moving gateway-range measurement, battery-runtime measurement,
low-power optimization and calibrated RF-power measurements remain separate
field/production work. No range or runtime result is inferred from this bench.
