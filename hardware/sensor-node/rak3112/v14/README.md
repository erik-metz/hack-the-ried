# RAK3112 / RAK3212 v14 — INA226 bring-up

TTN uplink decoder for this firmware: [`payload-formatter.js`](payload-formatter.js).
Install this file in TTN before flashing this firmware.

v14 retains v13 and adds identification, calibration and sampling for the INA226
module with the **R100 (0.100 ohm)** shunt shown in the hardware reference photo.
The shunt value must match the actual board. An INA226 cannot measure station
consumption merely by connecting its four I2C/supply wires.

## Identification and wiring

Logic: VCC to 3.3 V, GND to common ground, SDA to GPIO14, SCL to GPIO13.
IN+, IN- and VBS/VBUS are not needed for identification. ALERT may remain open.
At boot, every responding address from 0x40 through 0x4F is checked against
manufacturer ID 0x5449 and die ID 0x226x before any configuration write.
The printed raw IDs distinguish an actual INA from the scanner's address hints.
A confirmed INA at 0x44 is rejected because that address belongs to the SHT41;
change the module's address straps to a free address (normally 0x40). If two
physical devices share an address, their combined replies may prevent either ID
from being identified; disconnect one and retry. No automatic readdressing is
attempted. A missing INA does not disable the other sensors.

For high-side total station consumption, put the shunt in the **common positive
supply path**, before the supply branches to RAK, SPS30 and other loads:

```text
Supply + ---- IN+ [R100 shunt] IN- ---- Station supply +
                              |
                             VBUS
Supply - ---------------------------- Station GND / INA GND
```

VBUS may already be connected to IN- on a particular breakout; check continuity
with power off before adding a jumper. IN- is not ground. Ensure there is no
parallel supply path through the USB cable or battery bypassing the shunt. Do
not improvise connections to the RAK's 3.3 V regulator output; the actual station
power-entry connector and USB arrangement must be established first.

The INA226 shunt ADC is limited to approximately +/-81.92 mV, giving about
+/-0.819 A with R100. This is a measurement range, not a guarantee of the board's
thermal/current rating. Never route a larger unverified load through this module.

## Measurement behavior

Configuration 0x4527 uses continuous bus/shunt conversion, 16 averages and 1.1 ms
per conversion (35.2 ms per averaged pair). CAL=2048 selects Current_LSB=25 uA
for R100. Configuration/calibration are written only after positive chip ID;
calibration is verified at setup and again before accepting each sample.
Every 250 ms the main loop checks conversion-ready and overflow flags and reads
bus, shunt and current. Saturated shunt values and math overflow are rejected.
Bus voltage is 1.25 mV/LSB; shunt voltage is signed 2.5 uV/LSB. Current is signed
25 uA/LSB; signed power is calculated from bus voltage and calibrated current.
The serial display reports V, uV, mA and mW every five seconds.

Polling pauses during existing blocking LoRaWAN operations. These samples are
for bring-up and window statistics: they do **not** yet form a validated energy
meter, peak-current logger, or Wh/day measurement. Those require measured wiring,
comparison with a reference load/meter, and continuous acquisition/integration
that accounts for transmit intervals. Open measurement inputs can produce zero
or meaningless readings; a responding chip alone does not prove station power is
being measured. Never interpret such zeros as zero station consumption.

## Payload and deployment

Install `payload-formatter.js` in TTN before flashing. The decoder continues
to accept formats 3-7. v14 automatically emits format **7** if no INA readings are
present, or **8** when INA readings are included. Both retain the format-7 header,
presence/wide bitmaps and existing scales, described in `../v13/README.md`.
Format 8 adds four fields and sample-count group 10:

| Code | Metric | On-wire integer / default width | Decoded unit / scale |
| --- | --- | --- | --- |
| 36 | bus_voltage | unsigned mV / 2 bytes | mV / 1 |
| 37 | shunt_voltage | signed uV / 3 bytes | µV / 1 |
| 38 | current | signed uA / 3 bytes | mA / 0.001 |
| 39 | power | signed uW / 4 bytes | mW / 0.001 |

Each retains minimum, mean, maximum and the shared uint24 sample count. The
int32 escape mechanism applies as before. The 30-channel baseline is **204 bytes**
(no wide escapes), leaving six 3-byte audio records within 222 bytes. Legacy
formats retain their original whole mA/mW scales, so older devices keep working.
The API/DB/frontend receive the existing metric names and units; actual delivery
still requires a healthy webhook and backend. No API or VPS changes are made here.

```sh
node --test hardware/sensor-node/rak3112/v1/*test.mjs
./hardware/sensor-node/rak3112/build.sh v14 rak3112-002
./hardware/sensor-node/rak3112/build.sh v14 rak3112-002 --port /dev/cu.usbmodem1101
arduino-cli monitor -p /dev/cu.usbmodem1101 -c baudrate=115200
```

Tests compile the actual portable C++ identity/conversion and payload code and
check it against the TTN decoder, including negative current/power, sub-mA
precision, full packets, old formats, absent INA and saturation handling.
The audio model and its licenses are unchanged from v13/v12.

Reference: [TI INA226 datasheet](https://www.ti.com/lit/ds/symlink/ina226.pdf),
registers 00h, 01h, 02h, 04h, 05h, 06h, FEh and FFh.
