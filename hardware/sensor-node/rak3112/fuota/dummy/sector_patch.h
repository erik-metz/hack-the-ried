#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string.h>

namespace lab {
constexpr size_t SECTOR = 4096;

// NOR flash can only clear bits until the containing sector is erased.
// Preserve all neighboring bytes when a delta replaces a block in a clone.
template <typename Read, typename Erase, typename Write>
bool rewriteSector(size_t offset, const uint8_t* data, size_t size,
                   uint8_t scratch[SECTOR], Read read, Erase erase, Write write) {
  const size_t within = offset % SECTOR;
  const size_t sector = offset - within;
  if (!data || !size || size > SECTOR-within) return false;
  if (!read(sector, scratch, SECTOR)) return false;
  memcpy(scratch+within, data, size);
  return erase(sector, SECTOR) && write(sector, scratch, SECTOR);
}
}
