#ifdef RAK_SHT41_ONLY
#include "../v15/compact_payload.h"
static constexpr uint8_t FIRMWARE = 15;
#elif defined(RAK_INA226)
#include "../v14/compact_payload.h"
static constexpr uint8_t FIRMWARE = 14;
#else
#include "../v13/compact_payload.h"
static constexpr uint8_t FIRMWARE = 13;
#endif
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
#ifdef RAK_SHT41_ONLY
    if (!CompactPayload::isUplinkMetric(code)) continue;
#endif
    metrics[code] = metric;
  }
  uint8_t bytes[222] = {};
  const size_t length = CompactPayload::encode(bytes, capacity, FIRMWARE, seconds, metrics);
  for (size_t i = 0; i < length; ++i) std::cout << unsigned(bytes[i]) << ' ';
  std::cout << '\n';
}
