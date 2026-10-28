#pragma once

#include <stddef.h>
#include <stdint.h>
#include <string.h>

// Formats 7/8: five-byte header, six-byte presence bitmap, six-byte wide-value
// bitmap; metrics in code order, then uint24 sample counts in group order.
// Bit code-1 is the low bit first within each bitmap byte. Values are big-endian.
// Trailing audio records are three bytes: class, count, score percent.
namespace CompactPayload {
static constexpr uint8_t VERSION = 8;
static constexpr size_t HEADER_BYTES = 17;

// SCD41/BME688 temperature and humidity remain available locally for sensor
// diagnostics and gas compensation. Only SHT41 supplies these uplink metrics.
inline bool isUplinkMetric(uint8_t code) {
  return code != 5 && code != 6 && code != 18 && code != 19;
}

struct Field {
  uint8_t code;
  uint8_t group;
  uint8_t width;
  bool signedValue;
  bool meanOnly;
};

static constexpr Field FIELDS[] = {
    {1, 1, 2, true, false}, {2, 1, 2, false, false},
    {3, 4, 2, false, false}, {4, 2, 2, false, false},
    {5, 2, 2, true, false}, {6, 2, 2, false, false},
    {7, 8, 2, true, false},
    {8, 9, 2, false, true}, {9, 9, 2, false, true},
    {10, 9, 2, false, true}, {11, 9, 2, false, true},
    {12, 9, 3, false, true}, {13, 9, 3, false, true},
    {14, 9, 3, false, true}, {15, 9, 3, false, true},
    {16, 9, 3, false, true}, {17, 9, 2, false, true},
    {18, 6, 2, true, false}, {19, 6, 2, false, false},
    {20, 6, 2, false, false}, {21, 7, 3, false, false},
    {29, 3, 2, false, false}, {30, 3, 2, false, false},
    {31, 5, 3, false, false}, {32, 4, 3, false, true},
    {33, 5, 3, false, true},
    {36, 10, 2, false, false}, {37, 10, 3, true, false},
    {38, 10, 3, true, false}, {39, 10, 4, true, false},
};

struct Metric {
  int32_t minimum = 0;
  int32_t mean = 0;
  int32_t maximum = 0;
  uint32_t count = 0;
  bool present = false;
};

inline bool fits(int32_t value, const Field& field) {
  const int64_t limit = int64_t(1) << (field.width * 8 - (field.signedValue ? 1 : 0));
  return value >= (field.signedValue ? -limit : 0) && value < limit;
}

inline bool append(uint8_t* output, size_t& length, size_t capacity,
    uint32_t value, uint8_t width) {
  if (length + width > capacity) return false;
  for (int shift = (width - 1) * 8; shift >= 0; shift -= 8) {
    output[length++] = static_cast<uint8_t>(value >> shift);
  }
  return true;
}

// Returns zero on invalid/unrepresentable input or insufficient capacity.
// A wide bit selects signed int32 for every statistic of that metric, retaining
// the original scale and exact integer values even outside the compact range.
inline size_t encode(uint8_t* output, size_t capacity, uint8_t firmware,
    uint32_t seconds, const Metric* metrics) {
  if (capacity < HEADER_BYTES || seconds == 0 || seconds > 0xFFFFFF) return 0;
  memset(output, 0, HEADER_BYTES);
  size_t length = 0;
  const bool hasIna = metrics[36].present || metrics[37].present || metrics[38].present || metrics[39].present;
  append(output, length, capacity, hasIna ? VERSION : 7, 1);
  append(output, length, capacity, firmware, 1);
  append(output, length, capacity, seconds, 3);
  length = HEADER_BYTES;
  uint32_t counts[11] = {};
  bool supported[42] = {};
  bool any = false;
  for (const Field& field : FIELDS) {
    supported[field.code] = true;
    const Metric& metric = metrics[field.code];
    if (!metric.present) continue;
    if (metric.count == 0 || metric.count > 0xFFFFFF ||
        (!field.meanOnly && (metric.minimum > metric.mean || metric.mean > metric.maximum))) return 0;
    any = true;
    const size_t byte = (field.code - 1) / 8;
    const uint8_t bit = 1U << ((field.code - 1) % 8);
    output[5 + byte] |= bit;
    const bool wide = !fits(metric.mean, field) ||
        (!field.meanOnly && (!fits(metric.minimum, field) || !fits(metric.maximum, field)));
    if (wide) output[11 + byte] |= bit;
    const uint8_t width = wide ? 4 : field.width;
    if (!field.meanOnly && !append(output, length, capacity, metric.minimum, width)) return 0;
    if (!append(output, length, capacity, metric.mean, width)) return 0;
    if (!field.meanOnly && !append(output, length, capacity, metric.maximum, width)) return 0;
    if (metric.count > counts[field.group]) counts[field.group] = metric.count;
  }
  if (!any) return 0;
  for (uint8_t code = 1; code <= 41; ++code) {
    if (metrics[code].present && !supported[code]) return 0;
  }
  for (uint8_t group = 1; group <= 10; ++group) {
    if (counts[group] && !append(output, length, capacity, counts[group], 3)) return 0;
  }
  return length;
}
}  // namespace CompactPayload
