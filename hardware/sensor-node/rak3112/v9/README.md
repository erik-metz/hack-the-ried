# RAK3112 environmental firmware v9

Firmware v9 extends v8 with BME680/BME688 measurements. The Bosch BME68x
SensorAPI performs calibration compensation over the shared RAK3212 I²C bus
(SDA GPIO14, SCL GPIO13).

| Sensor | Address | Measurements |
| --- | --- | --- |
| SHT41 | `0x44` | Temperature and relative humidity |
| SGP41 | `0x59` | VOC and NOx indices |
| SCD41 | `0x62` | CO₂, temperature and relative humidity |
| LTR390 | `0x53` | UV index and ambient light |
| BME680/BME688 | `0x76` or `0x77` | Temperature, humidity, pressure, gas resistance |

The BME68x chip ID (`0x61`) is checked before initialization. Forced-mode
measurements use 2x temperature, 4x pressure and 2x humidity oversampling. The
gas heater runs at 320 °C for 150 ms every 10 seconds; gas resistance is sent
only when the sensor reports valid gas data and a stable heater. Temperature,
humidity and pressure remain available when gas data is not yet stable.

## BME payload measurements

The format-4 TLV payload and TTN decoder already define these metric IDs:

| Code | Metric | Unit | Encoding |
| --- | --- | --- | --- |
| 18 | `bme688_temperature` | `°C` | hundredths |
| 19 | `bme688_humidity` | `%` | hundredths |
| 20 | `pressure` | `hPa` | tenths |
| 21 | `bme688_gas_resistance` | `Ω` | whole ohms |

The BME688 gas-resistance value is the compensated sensor resistance. It is not
an IAQ score, CO₂ estimate or bVOC estimate. Those Bosch BSEC-derived values
are intentionally not emitted. The gas heater and sensor placement can affect
the local temperature reading; allow the sensor to stabilize after installation.

The frontend labels the measurements, shows them under weather (environmental
measurements) or air quality (gas resistance), and retains the existing LTR390
and SCD41 readings.

The BME68x driver files in this folder are from Bosch Sensortec's official
[BME68x SensorAPI](https://github.com/boschsensortec/BME68x_SensorAPI) and are
distributed under the included BSD-3-Clause license.

## Build and flash

```sh
./hardware/sensor-node/rak3112/build.sh v9 <device-profile-id>
./hardware/sensor-node/rak3112/build.sh v9 <device-profile-id> --port /dev/cu.usbmodem11101
arduino-cli monitor -p /dev/cu.usbmodem11101 -c baudrate=115200
```

The serial log should show the BME68x address and chip ID, temperature,
humidity, pressure and gas resistance when valid. A firmware v9 uplink includes
metric IDs 18–21 as available. Keep per-device OTAA profiles outside tracked
Git files.
