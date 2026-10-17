# RAK3112 firmware and device organization

## Versioning

Each released firmware version lives in its own numbered folder (`v1/`,
`v2/`, …). Do not edit an older folder to add hardware support for a new
version. The folder number is the firmware version; it is sent as a single
integer in each uplink. Keep the LoRaWAN payload-format number separate.

`v1/payload-formatter.js` is the shared TTN application decoder. It supports
payload formats still used by deployed firmware, so TTN can keep one formatter
for multiple RAK devices. Metric IDs and their scales are documented in
`v1/README.md`. Assign new metric IDs there before emitting new measurements.

## Device credentials and identity

Create one TTN end device per physical RAK and give it a unique device ID and
OTAA credentials. Use the same TTN application and webhook as the other RAK
nodes unless the deployment requires separate access controls. Store one local
profile per TTN device ID at
`~/.config/kamue-digital-lora/rak3112/<device-id>.h` (directory mode 700,
file mode 600). The build helper selects the matching profile by the explicit
device ID, injects it into a temporary build copy, and removes that copy after
building. Secrets stay outside Git and the application database. Never commit
OTAA keys or per-device exports. Confirm the printed DevEUI matches the
selected TTN device before flashing. Each RAK keeps its own LoRaWAN
nonce/session state in its ESP32 NVS.

The backend derives its stable sensor ID from the TTN device ID (`ttn-<id>`).
New devices start hidden. When TTN includes a valid configured location in its
uplink, the backend copies those coordinates into sensor metadata. Verify the
location and enable map visibility in the backend admin before publishing it.
Firmware version is stored on sensor metadata and shown in the map popup; it is
deliberately excluded from the measurement history.

## Build and flash

Use `./hardware/sensor-node/rak3112/build.sh v2 <ttn-device-id>` to compile, or
add `--port /dev/cu.usbmodem...` to upload to a deliberately selected board.
See each version's README for the exact pinout. Firmware v2 adds an SHT41 at
I²C address `0x44`, with SDA on GPIO17 and SCL on GPIO14.
