# RAK3112 FUOTA lab: dummy bring-up

This experimental branch of the firmware is separate from the sensor `vN`
releases. A sends constant 111, B sends constant 222. Both include a build
version and uint32 packet counter on port 42, once every five minutes. They use
OTAA 1.1, ADR, RadioLib duty-cycle enforcement and Class C. The default TTN
build matches the existing 868.1-MHz device plan. `--network chirpstack` selects
full EU868 for a private-network profile. Use USB power during testing.
The receiver implements a private lab fragment protocol on port 43, with
SHA-256 verification and activation of the inactive ESP OTA slot. It does not
implement TS004/TS005 or ChirpStack's built-in FUOTA workflow. Flashing B by USB
does not count as a FUOTA test. Full images must be sent on the private network,
not the public TTN community network.
Three failed join attempts pause the radio until a restart, so a broken
downlink path cannot cause an endless join loop during unattended bench tests.

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
python3 hardware/sensor-node/rak3112/fuota/build.py rak3112-fuota-001 1 --network chirpstack
python3 hardware/sensor-node/rak3112/fuota/build.py rak3112-fuota-001 2 --network chirpstack
# Upload only to a deliberately selected board:
python3 hardware/sensor-node/rak3112/fuota/build.py rak3112-003 1 --network ttn --port /dev/cu.usbmodem11101
node --test hardware/sensor-node/rak3112/fuota/tests/*.test.mjs
```

Install the local [payload decoder](dummy/payload-formatter.js) in the dedicated
test application's device profile. Do not replace the production application
decoder with this test-only format. `build/` is ignored and mode 700; binaries
contain device secrets and have mode 600. The custom 16-MB partition table has
two 6-MiB app slots. A working OTA target is checked at startup. Automatic boot
rollback is not provided by this sketch or implied by two app slots.

## Lab transfer protocol

All integers are big endian, application FPort 43. A nonzero uint32 session
identifies a transfer. Commands:

| Command | Encoding |
| --- | --- |
| START | `01`, session (4 bytes), image size (4 bytes), SHA-256 (32 bytes) |
| DATA | `02`, session (4 bytes), block index (2 bytes), up to 128 image bytes |
| APPLY | `03`, session (4 bytes) |
| ABORT | `04`, session (4 bytes) |
| STATUS | `05`, session (4 bytes) |

Blocks are fixed at 128 bytes except the final block. They can arrive out of
order; duplicates do not rewrite flash. Duplicate START with the same manifest
does not erase progress. A different active session requires ABORT first. A
STATUS reply is `01`, result (1 byte), session (4 bytes), received block count
(4 bytes), total block count (4 bytes), then up to eight missing uint16 block
indices. Result values: 0 idle, 1 receiving, 2 ready, 3 applied, 4 rejected,
5 storage error, 6 hash error. DATA does not generate status uplinks; poll
STATUS for repair after a batch. This avoids acknowledgements for every block.

APPLY requires all blocks, a matching hash read back from flash, a valid ESP
application image and a successful boot-partition update. Only then does it
reboot after the status transmission or a 30-second timeout. Interrupted
downloads leave the running slot selected. Download progress is RAM-only: after
a power cycle restart the whole transfer. There is no automatic rollback from
a valid image that crashes after activation. Keep USB access for this lab.
The network server is trusted to authorize updates through LoRaWAN; SHA-256
alone is not an independent firmware signature. Multicast provisioning and
the shared TTN/ChirpStack radio path are not implemented in this increment.

Prepare the downlink bundle locally (this command sends no network traffic):

```sh
python3 hardware/sensor-node/rak3112/fuota/pack.py \
  hardware/sensor-node/rak3112/fuota/build/rak3112-003/2/dummy.ino.bin \
  hardware/sensor-node/rak3112/fuota/build/rak3112-003/2/transfer.json
```

The bundle contains credentials embedded in the firmware. Keep it local and
mode 600. A server sender must wait for START status, pace DATA according to
the private network's duty-cycle scheduler, repair missing blocks, and request
APPLY only after every target reports ready. Do not enqueue a whole bundle on
TTN. The packer does not upload, transmit or queue anything by itself.

Acceptance sequence: server health → private join/uplink → Class-C downlink →
fragment transport → image validation and OTA activation → post-reboot B
uplink → second node → multicast → loss, interruption and rollback tests.
