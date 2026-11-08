# Three-receiver FUOTA and per-device TTN labels

User requested `rak<number>-222`, explicitly excluding RAK2, and confirmed
RAK1/3/4/5 were powered. RAK1/3/4 started on saved common A (firmware1/value111).
RAK5 was already on the exact saved common B from the earlier verified update;
its live TTN uplink was independently checked as firmware2/value222 beforehand.
No USB flashing was performed during this fleet update. Heltec was not selected.

The over-air format remains eight binary bytes containing version, firmware,
value and application counter. Device-specific TTN formatters combine each
assigned RAK number with the **actual received value** in `message`, e.g.
`rak3-222`. This is a decoded label, not an ASCII string sent by the device.
Tests verify that an old 111 packet still produces `rak3-111`; the formatter
does not substitute a fixed target value. The application's global formatter
and existing backend integration were not changed.

## Exact transfer

- Base SHA256: `b521db0244735323aa180e84b10995fca850982dab73a790b85c27a614ec60f4`.
- Target SHA256: `40746a39d0897ef108696a80067fff3fcd65ee72bd45c62dbd49860187fa346b`.
- Each image is 386816 bytes; changed 128-byte blocks: 1, 343, 345, 3021.
- Fresh transfer session: `2640654748`.
- Bundle SHA256: `84807b99854e14dda8ba312ffe496fe0b823638ba7b618105ad42c3348a6e25f`.
- Existing RAK multicast group: `e2e1945e-29e4-4f49-b578-280338ca727f`.
- Explicit members: RAK1 `02837438D5995DF7`, RAK3 `0237C5608461F069`,
  RAK4 `02629E770438454A`, RAK5 `021F6846A820B440`.
- `--already-current 021F6846A820B440` excluded RAK5 from acknowledgements and
  from claims of a new firmware installation. All keyed receivers still hear
  the broadcast; a different running base rejects the delta before application.
  Its normal TTN value was checked again afterward.

The Pi checked the transferred bundle checksum before starting the sender.
Actual radio frames advanced the persisted group counter through frame22.
RAK1 and RAK4 reported Ready (3022/3022) on the first status. RAK3 initially
reported missing blocks [1,343], then [1]. Targeted repair eventually completed
all three; frame20 status confirmed Ready/3022/3022 independently for each.
Frame21 requested APPLY, which verifies the image before selecting the next
boot partition. A control retry used frame22. The sender then printed VERIFIED
firmware2/value222 separately for all three companions and exited successfully.
It did not count RAK5 as newly updated.

The sender running this successful transfer was from commit `58f76b2`.
The later `5f08567` adds a ten-second guard between private status uplinks and
the next multicast data/repair wave. MQTT sees an uplink before the node has
finished its private Class-A RX windows, so immediate first-block repair can
be lost repeatedly. A receiver-window timing model was added to the multicast
regression test. This guard was not needed to restart the successful transfer:
the original bounded repair loop completed on its own while browser access
was temporarily unavailable.

## Independent TTN evidence

TTN application `my-gps-tracker-2026` showed successful processing/forwarding
on each original device's FPort42, with firmware2/value222:

| Device | Forwarded uplink UTC on 2026-11-08 | Decoded message | Application counter |
| --- | --- | --- | --- |
| rak3112-001 | 14:43:23.140975113 | `rak1-222` | 1 |
| rak3112-003 | 14:48:22.985703694 | `rak3-222` | 2 |
| rak3112-004 | 14:43:59.483057614 | `rak4-222` | 1 |
| rak3112-005 | 14:47:07.048864423 | `rak5-222` | 85 |

Earlier new-boot packets were also visible: RAK1 at 14:38:16.405475931 UTC,
RAK3 at 14:38:09.497294818 UTC, and RAK4 at 14:38:52.743607754 UTC. RAK1's prior
14:37:40 uplink still decoded as `rak1-111`, independently showing the change.
RAK5 retained a steadily increasing counter rather than being reflashed.
LoRaWAN session persistence was retained; application counters restart on reboot.

The existing disabled webhook remains outside this test's scope. Successful
TTN application reception, not backend ingestion, is the result established here.

## Validation

53 local Node protocol/receiver/label tests and five multicast Python tests
passed for the label/mixed-fleet change. Exact saved firmware hashes were
checked before transfer. Hardware and Gateway CI succeeded for `58f76b2`;
Gateway CI also succeeded for `5f08567`. The final documentation commit has its
own relevant CI run. Unrelated enclosure and web work was not included.
