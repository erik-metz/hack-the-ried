# RAK3112 FUOTA lab: dummy bring-up

This experimental branch of the firmware is separate from the sensor `vN`
releases. A sends constant 111, B sends constant 222. Both include a build
version and uint32 packet counter on port 42, once every five minutes. They use
the full EU868 band, OTAA 1.1, ADR, RadioLib duty-cycle enforcement and Class C.
Use USB power during testing. This increment logs received downlinks; it does
not yet implement TS004/TS005 or install received firmware. Flashing B by USB
does not count as a FUOTA test.

## Profiles

Local private profiles are `../profiles/rak3112-fuota-001.h` and
`../profiles/rak3112-fuota-002.h`. They contain independently generated
ChirpStack identities, not the existing TTN credentials. Register each one in
ChirpStack with its matching DevEUI, JoinEUI, AppKey and NwkKey. For an optional
TTN test use separate `rak3112-003.h` / `rak3112-004.h` profiles. Keys and compiled
artifacts must stay local. Do not post them in chat or commit them. A distinct
NVS namespace derived from the full profile avoids reusing sessions after a
network/key change. A and B for the same profile share that namespace.

## Build

From the repository root:

```sh
python3 hardware/sensor-node/rak3112/fuota/build.py rak3112-fuota-001 1
python3 hardware/sensor-node/rak3112/fuota/build.py rak3112-fuota-001 2
# Upload only to a deliberately selected board:
python3 hardware/sensor-node/rak3112/fuota/build.py rak3112-fuota-001 1 --port /dev/cu.usbmodem11101
node --test hardware/sensor-node/rak3112/fuota/tests/*.test.mjs
```

Install the local [payload decoder](dummy/payload-formatter.js) in the dedicated
test application's device profile. Do not replace the production application
decoder with this test-only format. `build/` is ignored and mode 700; binaries
contain device secrets and have mode 600. The custom 16-MB partition table has
two 6-MiB app slots. A working OTA target is checked at startup. Automatic boot
rollback is not provided by this initial sketch or implied by two app slots.

Acceptance sequence: server health → private join/uplink → Class-C downlink →
fragment transport → image validation and OTA activation → post-reboot B
uplink → second node → multicast → loss, interruption and rollback tests.
