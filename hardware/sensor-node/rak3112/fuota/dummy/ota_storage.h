#pragma once
#include "transfer.h"
#include <esp_ota_ops.h>
#include <mbedtls/sha256.h>

class OtaStorage : public lab::Storage {
 public:
  bool begin(size_t size) override {
    target = esp_ota_get_next_update_partition(nullptr);
    if (!target || size > target->size) return false;
    open = esp_ota_begin(target, size, &handle) == ESP_OK;
    return open;
  }
  bool write(size_t offset, const uint8_t* data, size_t size) override {
    return open && esp_ota_write_with_offset(handle, data, size, offset) == ESP_OK;
  }
  bool verify(const uint8_t expected[32], size_t size) override {
    if (!open) return false;
    return hashMatches(target, expected, size);
  }
  bool copyBase(const uint8_t expected[32], size_t size) override {
    const esp_partition_t* source = esp_ota_get_running_partition();
    if (!open || !source || source->address == target->address || size > source->size || !hashMatches(source,expected,size)) return false;
    uint8_t data[512];
    for (size_t offset = 0; offset < size; offset += sizeof(data)) {
      const size_t length = size-offset < sizeof(data) ? size-offset : sizeof(data);
      if (esp_partition_read(source,offset,data,length) != ESP_OK || !write(offset,data,length)) return false;
      yield();
    }
    return true;
  }
  static bool hashMatches(const esp_partition_t* partition, const uint8_t expected[32], size_t size) {
    uint8_t data[512], actual[32];
    mbedtls_sha256_context ctx;
    mbedtls_sha256_init(&ctx);
    bool valid = mbedtls_sha256_starts(&ctx, 0) == 0;
    for (size_t offset = 0; valid && offset < size; offset += sizeof(data)) {
      const size_t length = size - offset < sizeof(data) ? size - offset : sizeof(data);
      valid = esp_partition_read(partition, offset, data, length) == ESP_OK
        && mbedtls_sha256_update(&ctx, data, length) == 0;
      yield();
    }
    valid = valid && mbedtls_sha256_finish(&ctx, actual) == 0;
    mbedtls_sha256_free(&ctx);
    return valid && memcmp(expected, actual, 32) == 0;
  }
  bool apply() override {
    if (!open) return false;
    // esp_ota_end also validates the ESP image and target chip.
    const esp_err_t result = esp_ota_end(handle);
    open = false;
    return result == ESP_OK && esp_ota_set_boot_partition(target) == ESP_OK;
  }
  void abort() override {
    if (open) esp_ota_abort(handle);
    open = false;
  }
 private:
  esp_ota_handle_t handle = 0;
  const esp_partition_t* target = nullptr;
  bool open = false;
};
