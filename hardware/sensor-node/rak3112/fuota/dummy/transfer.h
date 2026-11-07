#pragma once
#include <stddef.h>
#include <stdint.h>
#include <string.h>

// Private lab protocol on FPort 43. Integers are big endian.
// START: 1, session:u32, size:u32, SHA256:32.
// DATA:  2, session:u32, block:u16, bytes:1..128.
// APPLY: 3, session:u32. ABORT: 4, session:u32. STATUS: 5, session:u32.
// Control commands return status; DATA is silent. APPLY reboots after ACK/timeout.
namespace lab {
constexpr size_t BLOCK = 128;
constexpr size_t MAX_IMAGE = 6 * 1024 * 1024;
constexpr size_t MAX_BLOCKS = MAX_IMAGE / BLOCK;
enum Result : uint8_t { Idle, Receiving, Ready, Applied, Rejected, StorageError, HashError };
inline uint32_t u32(const uint8_t* p) {
  return (uint32_t(p[0]) << 24) | (uint32_t(p[1]) << 16) | (uint32_t(p[2]) << 8) | p[3];
}
inline void put32(uint8_t* p, uint32_t n) {
  for (int i = 3; i >= 0; --i) { p[i] = n; n >>= 8; }
}
struct Storage {
  virtual ~Storage() = default;
  virtual bool begin(size_t size) = 0;
  virtual bool write(size_t offset, const uint8_t* data, size_t size) = 0;
  virtual bool verify(const uint8_t hash[32], size_t size) = 0;
  virtual bool apply() = 0;
  virtual void abort() = 0;
  virtual bool copyBase(const uint8_t hash[32], size_t size) { (void)hash; (void)size; return false; }
};
class Transfer {
 public:
  explicit Transfer(Storage& backend) : storage(backend) {}
  uint32_t session = 0;
  uint32_t size = 0;
  uint32_t received = 0;
  Result state = Idle;

  Result command(const uint8_t* p, size_t n) {
    if (n < 5) return Rejected;
    const uint32_t id = u32(p + 1);
    // Never erase the selected boot target while waiting for the final ACK.
    if (state == Applied) return p[0] == 5 && n == 5 && id == session ? Applied : Rejected;
    if (p[0] == 1 || p[0] == 6) {
      const bool delta = p[0] == 6;
      if ((!delta && n != 41) || (delta && (n < 79 || n > 111)) || !id) return Rejected;
      const uint32_t length = u32(p + 5);
      if (!length || length > MAX_IMAGE) return Rejected;
      if (state == Receiving || state == Ready) {
        // Lost START ACK must not erase already received blocks.
        return n == manifestSize && !memcmp(manifest, p, n) ? state : Rejected;
      }
      const size_t count = delta ? (size_t(p[77]) << 8) | p[78] : 0;
      if (delta && (n != 79+2*count || u32(p+41) != length)) return Rejected;
      if (delta) for (size_t i = 0; i < count; ++i) {
        const size_t index = (size_t(p[79+2*i]) << 8) | p[80+2*i];
        if (index >= (length+BLOCK-1)/BLOCK) return Rejected;
        for (size_t j = 0; j < i; ++j) {
          if (p[79+2*j] == p[79+2*i] && p[80+2*j] == p[80+2*i]) return Rejected;
        }
      }
      storage.abort();
      session = id; size = length; received = 0;
      memcpy(manifest, p, n); manifestSize = n;
      memcpy(hash, p + 9, 32); memset(bitmap, 0, sizeof(bitmap));
      if (!storage.begin(size)) return state = StorageError;
      if (delta) {
        if (!storage.copyBase(p+45, length)) { storage.abort(); return state = HashError; }
        memset(bitmap, 0xff, sizeof(bitmap));
        for (size_t i = 0; i < count; ++i) {
          const size_t index = (size_t(p[79+2*i]) << 8) | p[80+2*i];
          bitmap[index/8] &= ~(1 << (index%8));
        }
        received = blocks()-count;
        return state = count ? Receiving : Ready;
      }
      return state = Receiving;
    }
    if (id != session || !id) return Rejected;
    if (p[0] == 5) return n == 5 ? state : Rejected;
    if (p[0] == 4) {
      if (n != 5 || state == Applied) return Rejected;
      storage.abort(); received = 0; size = 0;
      return state = Idle;
    }
    if (p[0] == 2) {
      if ((state != Receiving && state != Ready) || n < 8 || n > 7 + BLOCK) return Rejected;
      const size_t block = (size_t(p[5]) << 8) | p[6];
      const size_t offset = block * BLOCK;
      if (offset >= size) return Rejected;
      const size_t expected = size - offset < BLOCK ? size - offset : BLOCK;
      if (n - 7 != expected) return Rejected;
      if (bitmap[block / 8] & (1 << (block % 8))) return state;
      if (!storage.write(offset, p + 7, expected)) {
        storage.abort(); return state = StorageError;
      }
      bitmap[block / 8] |= 1 << (block % 8); ++received;
      return state = received == blocks() ? Ready : Receiving;
    }
    if (p[0] == 3) {
      if (n != 5 || state != Ready) return Rejected;
      if (!storage.verify(hash, size)) { storage.abort(); return state = HashError; }
      if (!storage.apply()) { storage.abort(); return state = StorageError; }
      return state = Applied;
    }
    return Rejected;
  }
  size_t blocks() const { return (size + BLOCK - 1) / BLOCK; }
  // Status includes up to 8 missing block numbers for targeted repair.
  size_t status(uint8_t out[30], Result result) const {
    out[0] = 1; out[1] = result; put32(out + 2, session);
    put32(out + 6, received); put32(out + 10, blocks());
    size_t n = 14;
    for (size_t i = 0; i < blocks() && n < 30; ++i) {
      if (!(bitmap[i / 8] & (1 << (i % 8)))) { out[n++] = i >> 8; out[n++] = i; }
    }
    return n;
  }
 private:
  Storage& storage;
  uint8_t hash[32] = {};
  uint8_t manifest[111] = {};
  size_t manifestSize = 0;
  uint8_t bitmap[MAX_BLOCKS / 8] = {};
};
}
