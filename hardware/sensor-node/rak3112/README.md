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
nodes unless the deployment requires separate access controls. Store one local profile per device ID at
`hardware/sensor-node/rak3112/profiles/<device-id>.h` (directory mode 700,
file mode 600; this directory is git-ignored). The build helper selects the
matching profile by the explicit device ID, injects it into a temporary build
copy, and removes that copy after building. Secrets stay outside Git and the
application database. Never commit OTAA keys or per-device exports. Confirm the printed DevEUI matches the
selected TTN device before flashing. Each RAK keeps its own LoRaWAN
nonce/session state in its ESP32 NVS.

The backend derives its stable sensor ID from the TTN device ID (`ttn-<id>`).
New devices start hidden. When TTN includes a valid configured location in its
uplink, the backend copies those coordinates into sensor metadata. Verify the
location and enable map visibility in the backend admin before publishing it.
Firmware version is stored on sensor metadata and shown in the map popup; it is
deliberately excluded from the measurement history.

## Build and flash

Use `./hardware/sensor-node/rak3112/build.sh v9 <device-profile-id>` to compile the
latest firmware, or
add `--port /dev/cu.usbmodem...` to upload to a deliberately selected board.
The build helper automatically includes `hardware/libraries` (containing `RadioLib`)
so builds succeed independently of global Arduino CLI library installations.
See each version's README for the exact pinout. Firmware v7 reads the SHT41 at
I²C address `0x44`, SGP41 at `0x59`, and SCD41 at `0x62` on the shared bus, SDA GPIO14 and SCL
GPIO13. It transmits CO₂, temperature, humidity, and Sensirion VOC/NOx indices.
Firmware v8 additionally reads the LTR390 at `0x53`, alternates ALS and UV
sampling, and sends UVI, ambient-light lux and both raw channels to the shared
TTN decoder and frontend. See `v8/README.md` for its pin, conversion and
validation details. Firmware v9 adds Bosch BME680/BME688 measurements at I²C
address `0x76` or `0x77`. It emits calibrated temperature, humidity, pressure,
and validated gas resistance while preserving the v8 LTR390 and other sensors.
See `v9/README.md` for settings, metric scales and BSEC limitations.
