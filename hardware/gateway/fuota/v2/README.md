# FUOTA lab v2: one Station, two network paths

This experimental overlay preserves the existing Basics Station hardware owner,
the durable TTN uplink bridge, TLS authentication to TTN, the current channel
plan and the host guardian. It adds a secondary local Basics Station connection
to the isolated ChirpStack stack in `../v1`. Concentratord is not needed for
this variant; the old server folder and production forwarder remain available.

Selected test DevEUIs route their joins exclusively to ChirpStack. Data frames
with the private NetID 000000 route exclusively to ChirpStack. Other traffic
retains its existing TTN path. There is no fallback of private joins into TTN,
no forwarding of TTN credentials, and no private offline-join replay. Downlink
interaction IDs are mapped to avoid collisions between the servers, and
transmit confirmations return only to their originating server.

Only TTN may program the radio. The secondary channel plan and data rates must
match before private routing becomes ready. Station duty-cycle enforcement is
explicitly enabled to cover the combined transmitter use of both servers.
Class-A freshness checks also apply to private downlinks. The single physical
transmitter remains half duplex; radio reception can be interrupted by FUOTA
transmission, and the Station's scheduling decisions can reject conflicting
downlinks. This overlay is a bench experiment, not a production release.

## Private identities

Build with `fuota/build.py rak3112-003 1 --network chirpstack`. The helper derives
independent AppKey/NwkKey values and a local JoinEUI from the selected profile.
It preserves the DevEUI and leaves the user's TTN profile unchanged. Private
and TTN identities use different NVS namespaces and build output folders. The
common image obtains credentials from NVS; `provision.py` sends the selected
identity only over the physical USB port. Never embed one device's identity
into a multicast image.
Registration is written to the ignored, private `build/rak3112-003/chirpstack/provision.json`.
The matching B build uses version `2`. Do not register the raw TTN keys in
ChirpStack, and do not flash the TTN build while routing this DevEUI privately.

## Prerequisites and verification

Start the v1 server stack first. Pin the base gateway image to the tested commit
for this overlay. On the Pi the existing deployment is `/home/alpha/hack-the-ried/gateway`;
it contains the original `.env` and state. The source is now in `hardware/gateway`.
Preserve that deployed manifest after a sparse-checkout update. Keep a local
tag of the previous image, verify the guardian is active and stop Watchtower
while experimenting. Do not stop the guardian: this variant retains its exact
health interface and hardware process.

Set `FUOTA_LAB_DIR` to the absolute v2 source directory, `FUOTA_PRIVATE_DIR` to
a mode-700 host directory for provisioning files, and `FUOTA_TEST_DEV_EUIS` to
the comma-separated test whitelist. Never put device keys in these variables.
The public `region_eu868.toml` must be readable by the nonroot ChirpStack
container user (mode 644), including after checkout under a restrictive umask.
Use the original gateway `.env`; do not create a second copy of its TTN key.

Overlay the existing gateway manifest with `compose.radio.yml` in the same
Compose project. The added external Docker network is `kamue-fuota-v1_default`.
No host ports, SPI devices or GPIO devices are added by the overlay. Both the
ordinary `health.json` and the new `fuota-health.json` must be fresh and ready
before a private join test. Verify the active OCI revision, TTN uplinks and the
private join/uplink. Verify both paths again after a reconnect.

`compose.tools.yml` overlays the v1 server manifest and provides a private
`lab-tools` container. It signs into the local-only API using the existing lab
admin login over gRPC (default for a new isolated instance; optional password file at
`/state/admin-password`). It does not create persistent API tokens. Provisioning
creates a dedicated lab tenant, application, profile and gateway. Existing
devices outside that application are refused; existing lab session keys are
compared and never silently changed. Nothing is printed except object IDs and
nonsecret diagnostics. Keep the admin UI bound to loopback.

## Private update test

The v2 server overlay selects EU868 RX2 DR5 for USB-powered bench nodes, so
128-byte data blocks fit Class-C downlinks. The original v1 region file stays
unchanged. `send.py` uses only the local ChirpStack API and MQTT, refuses non-lab
devices, paces packets by at least three seconds and defaults to at most 32
radio blocks. START and STATUS are acknowledged by real uplinks; missing blocks
are repaired in bounded rounds. APPLY is followed by an independent firmware-2,
value-222 uplink check. A queue insertion alone never counts as delivery.

For the first test use a small delta bundle (the count is measured
from the built images) with `pack.py --base <A.bin> <B.bin> <bundle.json>`. The
receiver validates the running base and complete target image. Full-image
transfers remain possible with an explicit larger sender block limit and take
substantially longer under the same duty-cycle limits. This is the project's
lab protocol, not ChirpStack's standard TS004/TS005 FUOTA deployment workflow.

## Rollback

Run the original gateway Compose manifest **without** `compose.radio.yml`, with
`GATEWAY_IMAGE` set to the saved previous image. `up -d --no-deps basicstation`
then removes the secondary network and experimental command/mount. The original
TTN `.env`, station state and journal stay at their existing paths. Confirm
radio readiness, LNS connectivity and a TTN uplink before restoring Watchtower.
Stopping only the v1 server stack does not remove the overlay; private joins
will be dropped while TTN continues normally.

Local checks: `python -m unittest discover -s hardware/gateway/fuota/v2 -v` with
`websockets==15.0.1`, plus Compose validation. CI additionally builds the private
API tools image and checks its ChirpStack API imports on ARM64. These checks
do not by themselves prove on-air operation or a completed firmware update.
