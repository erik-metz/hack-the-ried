# Heltec and FUOTA implementation plan review

Review date: 2026-11-10. This reconciles the last Heltec implementation plan
and the subsequent RAK fleet test with recorded evidence. Historical test
reports retain their original observations; later results supersede their
then-open verification items.

**Final status:** the original implementation and additional real Heltec FUOTA
acceptance are complete. The [November 10 test report](TEST-2026-11-10-FUOTA.md)
records the three-block radio update, selected-target verification, user-confirmed
OLED change and actual post-update TTN GPS reception. The preparation history
below describes the intermediate checks and access interruptions before success.

## Completed implementation and acceptance

| Planned step | Status and evidence |
| --- | --- |
| Preserve the original Heltec gateway and allow recovery | Complete: separate end-device directory, original gateway source retained, private full-flash backup recorded in [bring-up report](TEST-2026-11-08.md). |
| Implement the Heltec end device with display and GPS | Complete: separate firmware, OLED, checksum-valid GPS and fresh real fix verified. |
| Provision TTN identity and a separate private update identity | Complete: USB provisioning, TTN activation, independent private activation, isolated Heltec multicast group and retained RAK group. |
| Receive actual Heltec position data in TTN | Complete: successful decoded GPS uplink and TTN location extraction on November 8; exact reception evidence in the bring-up report. |
| Update multiple RAKs while keeping their telemetry on TTN | Complete: RAK1/3/4 updated together by multicast; independent new-firmware TTN reception for all three. RAK5 already ran the target and was checked separately. RAK2 excluded as requested. See [fleet report](../../../gateway/fuota/v3/TEST-2026-11-08-FLEET.md). |
| Display per-RAK `rakN-222` labels | Complete: TTN device decoders label the actual received value; all four device messages were verified. The radio payload remains binary. |

No missing source implementation was identified in these original four Heltec
steps or in the completed RAK fleet request.

## Current Heltec observation

The attached USB device identifies itself as `F8:5B:1B:A1:75:D8`, matching the
documented Heltec. Serial observation during this review reported:

```text
DISPLAY ready=1
TTN JOIN state=-1117 joined=1
TTN UPLINK firmware=2 value=222 counter=0 size=10 state=0
UPDATE JOIN state=-1117 joined=1; TTN remains active
UPDATE feedback port=42 state=1
```

This establishes the currently reported firmware version and local activation,
not the installation method, exact running-image hash, or fresh TTN application
reception. It does not prove a successful Heltec FUOTA transfer. GPS status was
present; precise coordinates were not captured in this public review.

The original saved A image still matches the bring-up SHA256 and size (442528
bytes). The newer local B image is 443088 bytes. Its existing bundle contains
3462 full-image blocks, not the small equal-size delta used for the RAK test.
Firmware version alone cannot identify an exact build. No stale image was
flashed and no radio transfer was started during this review.

### Exact-base and Pi checks completed afterward

The user confirmed the connected OLED displays v2 and restored Pi access.
Read-only esptool extraction of OTA selection records and app partition0
confirmed the running 443088-byte image matches the saved B byte-for-byte:
SHA256 `e9cfed0ec80eb39e4b878e20defd8eb0f648f45fadf37a4110edabbd2fa59e85`.
No application or NVS flash write was performed over USB. These reads reset
the board; they do not constitute a firmware installation.

The Pi Basics Station and all five private-stack containers were running;
Basics Station and PostgreSQL reported healthy. The temporary sender logs
were absent and the existing private update directory contained Heltec
registration/group state but no Heltec transfer bundle from the prior install.
This does not establish how the existing version2 was installed.

The new [display delta tool](../display_delta.py) exactly reproduced saved B
using esptool5.3.1 before changing the ELF's unique OLED title from GPS to OTA.
Only three ELF bytes changed; esptool regenerated the ELF/image digests and
validated the resulting image checksum and digest. The separate test target is
SHA256 `31cfa5bfde01f19101effcde932b6ae964d7b5a193691f7745f1259a647d2b99`.
Its fresh session411052235 changes blocks [1,3,3461], retaining GPS behavior and
firmware2/value222. Bundle SHA256 is
`98b5dea489e2affcde84ea251d62e1ea027b9b264effe243fabb017bf1e2d1e1`.

The first browser-transferred copy failed the checksum comparison and was
**not sent**. During preparation, native browser window changes interrupted
the Pi shell control. Once access was restored, a corrected separate copy
matched the exact bundle hash, and the actual radio transfer and independent
checks all completed successfully; see the final test report linked above.
Version2 feedback alone was not used to identify this title-only target.

## Hardware acceptance and remaining field work

- **Heltec real FUOTA transfer and post-update TTN GPS reception: complete.**
  Three blocks were sent, the receiver reported Ready, the sender completed,
  selected OTA partition1 verified against the target, the user confirmed
  `Heltec OTA v2`, and TTN forwarded a fresh seven-satellite GPS fix after reboot.
- **Moving range test:** requires taking the powered Heltec along the actual
  route and recording received packets, distance, RSSI/SNR and loss against
  the send schedule. This cannot be established by a stationary bench test.
- **Battery runtime, low-power operation and calibrated RF output:** remain
  unverified measurements/future work, as already documented. Continuous
  GPS/OLED/Class-C operation is the current prototype behavior.

## Local verification

The review reran all nine RAK FUOTA Node tests, seven Python provisioning/pack
tests and five gateway multicast tests successfully. The current local Heltec
working-tree suite also passed all three tests, including its newer batched-GPS
case. The two Heltec tests from the committed source were additionally run in
an isolated temporary directory and passed. Those newer source edits predated
this review and are not part of its changes. Four new display-delta tests also
passed: exact packet/base binding, wrong-base rejection, ambiguous-title
rejection and prevention of overwriting previous artifacts. Hardware CI passed
for both the initial plan review (`ab0a7c6`) and tool change (`5564379`).
No enclosure, backend or other pending work was included.
