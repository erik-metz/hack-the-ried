#include "../v14/ina226.h"
#include <assert.h>

int main() {
  assert(Ina226::isDevice(0x5449, 0x2260));
  assert(Ina226::isDevice(0x5449, 0x2261));
  assert(!Ina226::isDevice(0xFFFF, 0xFFFF));
  assert(!Ina226::isDevice(0x5449, 0x2280));
  Ina226::Reading reading;
  // 5 V, 12.5 mV across R100, 125 mA, 625 mW.
  assert(Ina226::decode(4000, 5000, 5000, reading));
  assert(reading.busMillivolts == 5000);
  assert(reading.shuntMicrovolts == 12500);
  assert(reading.currentMicroamps == 125000);
  assert(reading.powerMicrowatts == 625000);
  assert(Ina226::decode(4000, uint16_t(-5000), uint16_t(-5000), reading));
  assert(reading.shuntMicrovolts == -12500);
  assert(reading.currentMicroamps == -125000);
  assert(reading.powerMicrowatts == -625000);
  // Retain the 25 uA current resolution for eventual low-power measurements.
  assert(Ina226::decode(4000, 1, 1, reading));
  assert(reading.currentMicroamps == 25);
  assert(reading.powerMicrowatts == 125);
  assert(Ina226::decode(0, 0, 0, reading));
  assert(reading.powerMicrowatts == 0);
  assert(!Ina226::decode(0x8000, 0, 0, reading));
  assert(!Ina226::decode(4000, 0x7FFF, 0x7FFF, reading));
  assert(!Ina226::decode(4000, 0x8000, 0x8000, reading));
}
