# RAK3112 / RAK3212 v15 — SHT41 temperature and humidity only

TTN uplink decoder: [`payload-formatter.js`](payload-formatter.js).
Install it in TTN before flashing. It is unchanged from v14 and remains compatible
with older firmware. Firmware version 15 uses existing payload formats 7 (without
INA readings) and 8 (with INA readings); no decoder or backend migration is needed.

Only SHT41 supplies `temperature` and `humidity` in uplinks, including five-minute
minimum/mean/maximum statistics. SCD41 temperature/humidity (IDs 5/6) and BME688
temperature/humidity (IDs 18/19) are excluded before window aggregation. They stay
available for local diagnostics and gas compensation. If SHT41 is missing or fails,
no replacement temperature/humidity is sent. CO₂, pressure, gas, light, particles,
audio and INA226 measurements retain v14 behavior and wiring.

The full baseline is reduced from 30 to 26 channels and from 204 to 180 bytes with
INA, or from 26 to 22 channels and from 165 to 141 bytes without INA (no wide
escapes or audio records). Historic BME688/SCD41 temperature/humidity are hidden
by the frontend; existing stored readings are retained.

See [`../v14/README.md`](../v14/README.md) for INA226 wiring and limitations, and
[`../v13/README.md`](../v13/README.md) for aggregation and audio behavior.
The audio model and its licenses are unchanged.

```sh
node --test hardware/sensor-node/rak3112/v1/*test.mjs
./hardware/sensor-node/rak3112/build.sh v15 rak3112-002
./hardware/sensor-node/rak3112/build.sh v15 rak3112-002 --port /dev/cu.usbmodem1101
arduino-cli monitor -p /dev/cu.usbmodem1101 -c baudrate=115200
```

After flashing the deliberately selected board, verify firmware=15 in serial and
TTN, only SHT41 temperature/humidity in decoded measurements/window statistics,
and continued delivery of the other connected sensors. A build and host simulation
do not establish live device delivery.
