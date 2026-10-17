# RAK3112 firmware and device organization

## Versioning

Each released firmware version lives in its own numbered folder (`v1/`,
`v2/`, …). Do not edit an older folder to add hardware support for a new
version. A folder's sketch defines `FIRMWARE_VERSION_MAJOR`, `MINOR`, and
`PATCH`; firmware v2 uses `2.0.0` and sends it in every uplink. Keep the
LoRaWAN payload-format number separate from the firmware version.

`v1/payload-formatter.js` is the shared TTN application decoder. It supports
payload formats still used by deployed firmware, so TTN can keep one formatter
for multiple RAK devices. Metric IDs and their scales are documented in
`v1/README.md`. Assign new metric IDs there before emitting new measurements.

## Device credentials and identity

Create one TTN end device per physical RAK and give it a unique device ID and
OTAA credentials. Use the same TTN application and webhook as the other RAK
nodes unless the deployment requires separate access controls. Copy that
device's credentials into the ignored `secrets.h` in the firmware version
folder being built. Never commit `secrets.h`, TTN keys, or a per-device export.
When preparing a different RAK, replace the local credentials and verify the
DevEUI printed at boot before flashing/joining it. Each RAK keeps its own
LoRaWAN nonce/session state in its ESP32 NVS.

The backend derives its stable sensor ID from the TTN device ID (`ttn-<id>`).
New devices start hidden. When TTN includes a valid configured location in its
uplink, the backend copies those coordinates into sensor metadata. Verify the
location and enable map visibility in the backend admin before publishing it.
Firmware version is stored on sensor metadata and shown in the map popup; it is
deliberately excluded from the measurement history.

## Build and flash

See each version's README for the exact pinout and build command. Firmware v2
adds an SHT41 at I²C address `0x44`, with SDA on GPIO17 and SCL on GPIO14.
