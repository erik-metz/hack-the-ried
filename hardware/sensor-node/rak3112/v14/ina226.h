#pragma once
#include <stdint.h>
#include <math.h>

namespace Ina226 {
static constexpr uint16_t CONFIG = 0x4527;
static constexpr uint16_t CALIBRATION = 2048;
struct Reading {
  int32_t busMillivolts;
  int32_t shuntMicrovolts;
  int32_t currentMicroamps;
  int32_t powerMicrowatts;
};
inline bool isDevice(uint16_t manufacturer, uint16_t die) {
  return manufacturer == 0x5449 && (die & 0xFFF0) == 0x2260;
}
inline bool decode(uint16_t bus, uint16_t shunt, uint16_t current, Reading& out) {
  if (bus & 0x8000) return false;
  const int16_t signedShunt = static_cast<int16_t>(shunt);
  // Reject a saturated shunt instead of reporting clipped current as valid.
  if (signedShunt == INT16_MIN || signedShunt == INT16_MAX) return false;
  out.busMillivolts = static_cast<int32_t>(lround(bus * 1.25));
  out.shuntMicrovolts = static_cast<int32_t>(lround(signedShunt * 2.5));
  out.currentMicroamps = static_cast<int16_t>(current) * 25;
  // Signed power, preserving reverse-current direction. Bus is 1.25 mV/LSB.
  out.powerMicrowatts = static_cast<int32_t>(llround(bus * 0.00125 * out.currentMicroamps));
  return true;
}
}  // namespace Ina226
