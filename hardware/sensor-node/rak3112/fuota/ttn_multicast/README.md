# TTN data and private multicast updates

Build this common A/B sketch with `../dual_build.py` and provision a selected
board through `../dual_provision.py`. The normal identity joins TTN; a distinct
private identity carries update feedback and a shared Class-C group receives
firmware. Keys are stored in NVS and never compiled into the image.

The [local payload formatter](payload-formatter.js) handles the unchanged lab
formats (TTN telemetry on port 42, private feedback on ports 42 and 43).
Install it per test device without changing production application formatters.

See the [gateway v3 instructions](../../../../gateway/fuota/v3/README.md) for
radio routing, provisioning, counter persistence, repair, and verification of
real TTN uplinks before and after an update. The initial fixed period is five
minutes; update feedback uses only the private network. Continuous multicast
reception requires power. This is an experimental custom transport and does
not claim TS003/TS004/TS005 interoperability or signed production updates.
