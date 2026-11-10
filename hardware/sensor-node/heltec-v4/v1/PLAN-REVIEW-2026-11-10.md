# Heltec and FUOTA implementation plan review

Review date: 2026-11-10. This reconciles the last Heltec implementation plan
and the subsequent RAK fleet test with recorded evidence. Historical test
reports retain their original observations; later results supersede their
then-open verification items.

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

## Remaining hardware acceptance

- **Heltec real FUOTA transfer and post-update TTN GPS reception:** still lacks
  an installation log and independent post-update TTN evidence in the available
  records. First inspect the Pi sender logs for the existing version-2 install;
  do not repeat an update solely because an older report listed version1.
  Browser control timed out during the Pi-access check in this review, so no
  Pi-side conclusion can be drawn. The running build and installation method
  must be reconciled before preparing a new exact-base update.
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
this review and are not part of its
documentation change. No enclosure, backend or other pending work was included.
