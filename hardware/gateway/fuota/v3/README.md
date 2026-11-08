# TTN telemetry with an independent private update path

This bench implementation corrects the v2 experiment's network separation:
normal device identities and telemetry remain on TTN. Each board has a second,
independently derived local DevEUI and keys for private update feedback. It also
holds a shared multicast receive identity. ChirpStack sends actual multicast
frames through the existing single Basics Station radio owner; the new firmware
returns per-node status over its private control identity. No firmware/status
traffic needs to consume TTN application downlinks. This is still the project's
FPort-43 lab protocol, not ChirpStack's standard TS003/TS004/TS005 FUOTA flow.

The private control identity must **differ** from the original TTN DevEUI. Its
derived keys are never the original TTN keys. The original profiles stay local
and ignored. A/B images contain no keys. All three identities reside in NVS and
survive firmware replacement; the common images can be shared between boards.
Multicast counters are persisted under a namespace bound to the group keys,
before executing any flash command. Repeat provisioning preserves counters.
Replacing a group requires fresh keys, not resetting an existing counter.

## Firmware preparation

Use `hardware/sensor-node/rak3112/fuota/dual_build.py 1` and `2` to build the
`ttn_multicast` sketch. Both use the existing tested OTA receiver, sector-safe
delta writes and image verification. Stable sensor releases and Heltec gateway
code are untouched. The local [payload formatter](../../../sensor-node/rak3112/fuota/ttn_multicast/payload-formatter.js)
uses the existing port-42/43 lab formats; install per test device in TTN.

Run `dual_provision.py rak3112-005 --prepare-only` first. This creates a shared
private `build/dual-network/group.json` and a per-board registration JSON.
Only the latter JSON is transferred (sealed with the v2 filecrypto helper) to
the Pi. It contains the **private companion** keys, group keys, and public TTN
DevEUI; it never contains TTN root keys. Run this preparation again for each
board, preserving the same group file. The resulting control DevEUI is printed
without keys. Provision actual identities over USB using `--port <port>` after
the matching firmware is flashed. Keep the exact same A binary for every node
in a delta update; build timestamps can alter the base hash.

The firmware first joins TTN and sends telemetry. It then activates the separate
private control context. A private join failure does not disable normal TTN
telemetry. Both MAC contexts share the physical radio, are used sequentially,
and must both be outside their duty-cycle quiet periods before transmission.
Private multicast reception resumes after TTN transmit/RX1/RX2. Packets lost
during those intervals are repaired by the update sender. This is a powered
bench test; continuous Class-C reception is not a battery-sleep strategy.

## Pi setup

Keep the running v1 stack and v2 gateway router. Add this `compose.tools.yml`
after the v1 and v2 tools manifests, setting `FUOTA_V3_DIR` to this directory.
It adds `/lab3`, leaving the v2 tools at `/lab` and private files at `/state`.
The existing tools image has all required dependencies.

Invoke the v3 commands with `--entrypoint python lab-tools /lab3/tools.py
/state/<registration.json> --gateway 98FE54FFFE63713B`. It adds the companion
device to the private lab application and creates/reuses `kamue-ttn-update-v3`
with Class C, 869.525 MHz, DR5 and frame counter starting at 1. Group keys,
address and radio settings must match on subsequent runs; counters are never
reset. The chosen gateway is explicitly added to the group.

Crucially, configure the existing router whitelist with the **companion**
DevEUIs, not the original TTN DevEUIs. While migrating existing v2 nodes, retain
their old private DevEUIs only until each board has been converted. For a fully
migrated fleet all original device joins go to TTN; only the distinct companion
joins and private NetID-0 data go to ChirpStack. The shared Station still owns
the concentrator and global duty-cycle enforcement. Keep Watchtower stopped
during the experiment and the existing host guardian active.

## Update verification

Package a small A/B delta with `pack.py`. Run `/lab3/send.py /state/<bundle>
--devices <control-eui> ...` through the tools container. The sender requires
the complete multicast member list, validates every private companion tag,
serializes senders with a shared lock and expires queued frames after 120 s.
It broadcasts each block once to the group and repairs the union of missing
blocks. APPLY requires every selected device to report complete reception.
Each updated device must independently report firmware 2/value 222 over its
control path. That result alone does **not** prove TTN telemetry: separately
verify the original DevEUI's port-42 uplink in TTN before and after the update.
Queued packets or a connected TTN LNS alone never count as this proof.

This remains a prototype without signed manifests or verified boot rollback.
USB recovery and the saved previous gateway image remain available. For the
gateway rollback use the v2 README's plain original Compose deployment. For a
device rollback flash a saved image and provision its matching identity; never
erase NVS or reset LoRaWAN counters as a shortcut.

For a fleet containing a member already verified at the exact saved target
(e.g. RAK5 already on common B), pass its companion to `send.py
--already-current <eui>`, while still selecting **every** multicast member in
`--devices`. All radio frames still reach all keyed receivers. A receiver on a
different base rejects the delta; its running image remains selected. The
sender requires independent acknowledgements and boot reports from every
updating member, and never counts an already-current member as updated.
Check already-current devices in TTN before and after the transfer. Do not use
this option to hide an offline, failed or unknown firmware state.

For TTN device-level labels, run `label_formatter.py <rak-number>` from the RAK
FUOTA directory and install its output on that device only. An eight-byte radio
payload remains firmware/value/counter; TTN combines the assigned device number
with the **actually received** value in `message`, e.g. `rak3-222`. It also shows
`rak3-111` before the update; the decoder never substitutes a fixed target value.
This is a decoded label, not an ASCII string transmitted over the air.

The sender waits ten seconds after control acknowledgements before starting
each data/repair wave. MQTT reports the private uplink before the device has
finished its Class-A RX windows; sending repairs immediately can repeatedly
lose the first missing block while that device is still listening in RX1/RX2.
