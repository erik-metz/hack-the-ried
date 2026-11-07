#pragma once
#include <Arduino.h>
#include <Preferences.h>
#include <RadioLib.h>
#include <mbedtls/sha256.h>
#include <nvs.h>

// Identity is provisioned through the physical USB port, never through LoRa.
// Common A/B images contain no device keys, so an update preserves each node's
// own identity and can eventually be shared by multiple nodes.
class IdentityStore {
 public:
  uint8_t bytes[50] = {};
  char securityNamespace[14] = {};
  bool load() {
    Preferences store;
    if (!store.begin("kamue-fuota")) return false;
    const size_t count = store.getBytes("identity",bytes,sizeof(bytes));
    store.end();
    return count == sizeof(bytes) && valid(bytes) && name(bytes,securityNamespace);
  }
  uint64_t joinEui() const { return readEui(bytes+2); }
  uint64_t devEui() const { return readEui(bytes+10); }
  uint8_t* appKey() { return bytes+18; }
  uint8_t* nwkKey() { return bytes+34; }

  bool serialCommand() {
    while (Serial.available()) {
      const char value = Serial.read();
      if (value == '\r') continue;
      if (value != '\n') {
        if (line.length() < 120) line += value; else overflow = true;
        continue;
      }
      bool stored = false;
      // CFG1:<50-byte identity as hex>:<optional old fXXXXXXXXXXXX namespace>
      if (!overflow && line.startsWith("CFG1:") && line.length() >= 105) {
        uint8_t proposed[50];
        bool parsed = true;
        for (size_t i=0;i<50;++i) {
          const int high=nibble(line[5+i*2]), low=nibble(line[6+i*2]);
          if (high<0 || low<0) { parsed=false; break; }
          proposed[i]=(high<<4)|low;
        }
        String legacy;
        if (line.length()>105 && line[105]==':') legacy=line.substring(106);
        bool legacyValid = legacy.length()==0 || legacy.length()==13;
        if (legacy.length()) {
          legacyValid = legacyValid && legacy[0]=='f';
          for (size_t i=1;i<legacy.length();++i) legacyValid = legacyValid && nibble(legacy[i])>=0;
        }
        char destination[14];
        if (parsed && valid(proposed) && name(proposed,destination) && legacyValid
            && (line.length()==105 || line[105]==':') && migrate(legacy,destination)) {
          Preferences store;
          if (store.begin("kamue-fuota")) {
            stored = store.putBytes("identity",proposed,sizeof(proposed))==sizeof(proposed);
            store.end();
          }
        }
      }
      line=""; overflow=false;
      Serial.println(stored ? "PROFILE stored; restarting" : "PROFILE rejected");
      if (stored) { delay(200); ESP.restart(); }
    }
    return false;
  }
 private:
  String line;
  bool overflow = false;
  static int nibble(char c) {
    if (c>='0' && c<='9') return c-'0';
    if (c>='a' && c<='f') return c-'a'+10;
    if (c>='A' && c<='F') return c-'A'+10;
    return -1;
  }
  static uint64_t readEui(const uint8_t* data) {
    uint64_t result=0;
    for (size_t i=0;i<8;++i) result=(result<<8)|data[i];
    return result;
  }
  static bool valid(const uint8_t* data) {
    if (data[0]!=1 || data[1]!=TEST_NETWORK_ID || !readEui(data+10)) return false;
    bool app=false,nwk=false;
    for (size_t i=0;i<16;++i) {app=app||data[18+i]!=0; nwk=nwk||data[34+i]!=0;}
    return app && nwk;
  }
  static bool name(const uint8_t* data, char out[14]) {
    uint8_t digest[32];
    if (mbedtls_sha256(data,50,digest,0)!=0) return false;
    out[0]='l';
    for (size_t i=0;i<6;++i) snprintf(out+1+i*2,3,"%02x",digest[i]);
    return true;
  }
  static bool migrate(const String& legacy, const char* destination) {
    if (!legacy.length()) return true;
    Preferences old, current;
    nvs_handle_t handle;
    const esp_err_t found=nvs_open(legacy.c_str(),NVS_READONLY,&handle);
    if (found==ESP_ERR_NVS_NOT_FOUND) return true;
    if (found!=ESP_OK) return false;
    nvs_close(handle);
    if (!old.begin(legacy.c_str(),true)) return false;
    if (!current.begin(destination)) { old.end(); return false; }
    bool success=true;
    // A repeat provisioning must never roll frame counters or nonces back.
    if (!current.isKey("nonces")) {
      uint8_t nonces[RADIOLIB_LORAWAN_NONCES_BUF_SIZE], session[RADIOLIB_LORAWAN_SESSION_BUF_SIZE];
      if (old.isKey("nonces") && old.getBytes("nonces",nonces,sizeof(nonces))!=sizeof(nonces)) {
        success=false;
      } else if (old.isKey("nonces")) {
        success=current.putBytes("nonces",nonces,sizeof(nonces))==sizeof(nonces);
        if (success && old.getBytes("session",session,sizeof(session))==sizeof(session))
          success=current.putBytes("session",session,sizeof(session))==sizeof(session);
      }
    }
    current.end(); old.end(); return success;
  }
};
