# RAK3112 Umweltstation — Firmware v11

TTN uplink decoder for this firmware: [`payload-formatter.js`](payload-formatter.js).
Install this file in TTN before flashing this firmware.

Firmware v11 extends v10 with on-device 5-minute summaries and continuous
processing of ICS-43434 audio blocks. It sends one format-5 LoRaWAN uplink per
five-minute window. No raw audio or per-second raw samples are sent or stored.

## Connected sensors and sampling

| Sensor | Local sampling | Values included in the window |
| --- | --- | --- |
| SHT41 | About once per second | Temperature and relative humidity: minimum, mean, maximum |
| SCD41 | Sensor output about every 5 seconds | CO₂, sensor temperature and humidity: minimum, mean, maximum |
| SGP41 | About once per second after 10-second conditioning | VOC and NOx indices: minimum, mean, maximum |
| LTR390 | Alternating 100 ms UV and ambient-light conversions | UV index and lux: minimum, mean, maximum; raw ADC diagnostics: mean |
| BME68x | About every 10 seconds | Temperature, humidity, pressure and gas resistance: minimum, mean, maximum |
| ICS-43434 | Continuous 16 kHz I²S input, processed in 256-frame (16 ms) blocks | Minimum and maximum block level; energy-based mean across blocks |

All metric sample counts are sent with their sensor group. The count is zero
when that group had no valid sample. The BME68x gas-resistance count is separate
because its gas result is valid only after the heater stabilizes.

The microphone runs in a dedicated FreeRTOS task, so periodic I²C work and the
LoRaWAN send do not intentionally reduce its capture duty cycle. The strongest
16 ms RMS block becomes the sound maximum. Its mean is calculated from signal
energy, not by averaging decibel values. `sound_level` remains uncalibrated
dBFS; it is not dB SPL or dB(A). No event classification or raw-audio archive
is implemented.

SGP41 NOx and VOC readings are Sensirion relative indices, not specific gas
concentrations. They cannot be reported as ppm/ppb or attributed to a vehicle
without a separate suitable calibrated gas sensor. The BME68x gas-resistance
reading is also not an IAQ or CO₂ concentration.

## Format-5 uplink

The device uses FPort 10, EU868 DR5, and sends an unconfirmed uplink every five
minutes. A startup or reconnect can create a shorter first window; its actual
duration is carried in the payload. If a send fails, the measured statistics
remain in RAM and are included in a later attempt. A device power loss clears
that RAM window.

Format 5 is a compact binary record stream:

| Bytes | Meaning |
| --- | --- |
| 0 | Payload format (`5`) |
| 1 | Firmware version (`11`) |
| 2–4 | Window duration in seconds, unsigned 24-bit big-endian |
| Remaining | Four-byte records: tagged metric code, then a 24-bit value |

The record tag uses its top two bits for the statistic and the lower six bits
for the metric/group code. Statistic tags are `0 = minimum`, `1 = mean`,
`2 = maximum`, and `3 = sample count`. Measurement values are signed 24-bit integers,
except BME68x gas resistance (code 21), which is unsigned 24-bit. Sample counts
are unsigned 24-bit values. Metric scales and units are unchanged from format 4.

Most current metrics carry minimum, mean and maximum. LTR390 raw diagnostic
codes 32/33 carry only a mean. Sample count records use codes 50–57:

| Code | Sample group |
| --- | --- |
| 50 | SHT41 temperature and humidity |
| 51 | SCD41 CO₂, temperature and humidity |
| 52 | SGP41 VOC and NOx indices |
| 53 | LTR390 UV index and raw UV signal |
| 54 | LTR390 ambient light and raw ALS signal |
| 55 | BME68x temperature, humidity and pressure |
| 56 | BME68x gas resistance |
| 57 | ICS-43434 sound blocks |

At the current sensor set, the complete payload is at most 213 bytes, within
the firmware's 222-byte format limit. The shared decoder in
`payload-formatter.js` accepts old formats 3/4 and format 5. Install its
updated contents as the TTN FPort-10 uplink formatter before activating v11.

The TTN webhook writes sensor identity and metric definitions to the canonical
`entities` and `measurement_definitions` tables, and observations/statistics to
`readings` through `write_measurement`. Each windowed metric is represented by
separate `min`, `mean` and `max` readings, with `period_start`, `period_end`,
`interval_statistic` semantics, sample count and TTN provenance. The inferred
end is TTN's `received_at`; the start is `received_at - window_seconds`.

For compatibility with older chart readers, the webhook also mirrors each
decoded mean to `sensor_data`. This is a compatibility write, not the
authoritative store. `sensor_measurement_windows` and `sensor_window_metrics`
are read only as a fallback for historical windows; new TTN windows are
authoritative in `readings`. The public
`/api/v1/telemetry/latest/window?sensor_id=<sensor-id>` endpoint prefers the
latest canonical window and falls back to those historical tables. Other data
providers keep their source-defined sampling cadence. See
[`www/vps/ttn-sensor-ingestion.md`](../../../www/vps/ttn-sensor-ingestion.md)
for the webhook contract.

Firmware v11 does not classify audio events. The broad, draft multi-label
taxonomy and model evaluation plan for a future firmware version are in
[`audio-event-ml-plan.md`](../audio-event-ml-plan.md); provisional class IDs are
listed in [`audio-event-taxonomy-v1.json`](../audio-event-taxonomy-v1.json).

## Build and flash

```sh
./hardware/sensor-node/rak3112/build.sh v11 <device-profile-id>
./hardware/sensor-node/rak3112/build.sh v11 <device-profile-id> --port /dev/cu.usbmodem11101
arduino-cli monitor -p /dev/cu.usbmodem11101 -c baudrate=115200
```

Microphone wiring is unchanged from v10: SD to GPIO10, SCK/BCLK to GPIO11, WS
to GPIO12, L/R to VCC, VDD to 3.3 V, and GND to GND. See `../v10/README.md` for
the wiring photo context and initial microphone checks.
