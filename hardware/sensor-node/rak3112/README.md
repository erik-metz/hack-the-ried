# RAK3112 firmware and device organization

## Versioning

Each released firmware version lives in its own numbered folder (`v1/`,
`v2/`, …). Do not edit an older folder to add hardware support for a new
version. The folder number is the firmware version; it is sent as a single
integer in each uplink. Keep the LoRaWAN payload-format number separate.

Every numbered firmware directory includes a standalone **`payload-formatter.js`**
that decodes that firmware's uplinks. For v14, install
[`v14/payload-formatter.js`](v14/payload-formatter.js) in TTN before flashing.
A version directory therefore contains both the Arduino firmware and its matching
TTN JavaScript decoder; no imports or files from another directory are required
when pasting the decoder into TTN.

`v1/payload-formatter.js` remains the central development copy and existing
compatibility path for tests and tooling. When creating a new firmware version,
copy the compatible decoder into the new directory and update both the central
copy and the newest version's snapshot when changing the protocol. Keep older
version snapshots stable unless fixing their decoder. The latest snapshot must
match the central copy; CI checks this, decoder presence for every numbered
version, and sample uplinks for each version's wire format. `build.sh` also
rejects a version without its decoder.

The missing v2–v14 files were backfilled with the current backwards-compatible
decoder. These are compatible snapshots, not a reconstruction of the exact
historical decoder source at each release date. They support formats 3–8, so the
v14 decoder can also serve an application containing older deployed devices.
Metric IDs and scales are documented in `v1/README.md` and each active firmware's
README. Assign new metric IDs there before emitting new measurements.

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

Use `./hardware/sensor-node/rak3112/build.sh v14 <device-profile-id>` to compile the
latest firmware, or
add `--port /dev/cu.usbmodem...` to upload to a deliberately selected board. Firmware v10 adds
the ICS-43434 I2S microphone; see `v10/README.md` for wiring and serial diagnostics.
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
Firmware v10 adds the ICS-43434 digital microphone and reports an uncalibrated RMS sound level in dBFS;
see `v10/README.md` for wiring and validation details. Firmware v11 adds local
five-minute min/mean/max aggregation and continuous microphone block processing
using payload format 5; see `v11/README.md` for the format, sampling intervals,
database flow and limits. Firmware v12 adds an experimental on-device,
single-label ESC-50 classifier; it prints diagnostic scores to USB serial and
keeps the existing format-5 uplink unchanged. See `v12/README.md` for measured
resources and model limits. The broader multi-label taxonomy, evaluation plan
and future format-6/database work remain in `audio-event-ml-plan.md`.
An experimental host-side YAMNet runner now exists at
`tools/yamnet_baseline.py` with its pinned environment in
`tools/audio-baseline-requirements.txt`; it reads approved 16-kHz mono WAVs
locally. `tools/evaluate_sonyc_yamnet.py` evaluates verified SONYC-UST test
clips from local dataset archives. Both are research tools, not part of
firmware or the uplink contract.

Firmware v13 adds compact payload format 7: all 26 sensor channels fit in 165
bytes at their normal field widths, preserving existing precision and statistics.
Install the shared TTN decoder before flashing v13. See [`v13/README.md`](v13/README.md)
for the wire schema, overflow handling, deployment order and protocol tests.

Firmware v14 identifies and calibrates the INA226 R100 module and adds voltage,
current and power via format 8 (204 bytes for all 30 channels). Without INA data
it emits format 7. See [`v14/README.md`](v14/README.md) for wiring, limits,
measurement caveats and decoder deployment order.
