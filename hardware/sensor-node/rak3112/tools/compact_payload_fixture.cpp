#include "../v13/compact_payload.h"
#include <iostream>

// Host harness for the exact encoder included by the Arduino firmware.
int main() {
  unsigned seconds, capacity, count;
  if (!(std::cin >> seconds >> capacity >> count) || capacity > 222) return 2;
  CompactPayload::Metric metrics[42] = {};
  for (unsigned i = 0; i < count; ++i) {
    unsigned code;
    CompactPayload::Metric metric;
    if (!(std::cin >> code >> metric.minimum >> metric.mean >> metric.maximum >> metric.count) ||
        code == 0 || code > 41) return 2;
    metric.present = true;
    metrics[code] = metric;
  }
  uint8_t bytes[222] = {};
  const size_t length = CompactPayload::encode(bytes, capacity, 13, seconds, metrics);
  for (size_t i = 0; i < length; ++i) std::cout << unsigned(bytes[i]) << ' ';
  std::cout << '\n';
}
