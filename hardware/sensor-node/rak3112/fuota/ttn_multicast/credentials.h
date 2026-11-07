#pragma once
#include <Arduino.h>
#include <Preferences.h>
#include <RadioLib.h>
#include <mbedtls/sha256.h>
#include <nvs.h>

struct DeviceIdentity {
  uint8_t bytes[50] = {};
  char securityNamespace[14] = {};
  uint64_t eui(size_t offset) const {
    uint64_t value=0;
    for (size_t i=0;i<8;++i) value=(value<<8)|bytes[offset+i];
    return value;
  }
  bool init(const uint8_t* data,uint8_t network) {
    memcpy(bytes,data,50);
    bool app=false,nwk=false;
    for (size_t i=0;i<16;++i) { app|=bytes[18+i]!=0; nwk|=bytes[34+i]!=0; }
    if (bytes[0]!=1 || bytes[1]!=network || !eui(10) || !app || !nwk) return false;
    return name(bytes,50,'l',securityNamespace);
  }
  static bool name(const uint8_t* data,size_t size,char prefix,char out[14]) {
    uint8_t hash[32];
    if (mbedtls_sha256(data,size,hash,0)!=0) return false;
    out[0]=prefix;
    for (size_t i=0;i<6;++i) snprintf(out+1+i*2,3,"%02x",hash[i]);
    return true;
  }
};

class Credentials {
 public:
  DeviceIdentity ttn, control;
  uint8_t group[36] = {};
  char multicastNamespace[14] = {};
  uint32_t address() const { return lab::u32(group); }
  bool load() {
    Preferences store;
    uint8_t data[136];
    if (!store.begin("kamue-dual-v3")) return false;
    const size_t length=store.getBytes("identity",data,sizeof(data));
    store.end();
    return length==sizeof(data) && init(data);
  }
  void serialCommand() {
    while (Serial.available()) {
      char c=Serial.read();
      if (c=='\r') continue;
      if (c!='\n') { if (line.length()<320) line+=c; else overflow=true; continue; }
      bool stored=false;
      if (!overflow && line.startsWith("CFG3:") && line.length()==291 && line[277]==':') {
        uint8_t data[136]; bool parsed=true;
        for (size_t i=0;i<sizeof(data);++i) {
          int a=nibble(line[5+2*i]),b=nibble(line[6+2*i]);
          if (a<0 || b<0) { parsed=false; break; }
          data[i]=(a<<4)|b;
        }
        String legacy=line.substring(278);
        bool valid=legacy.length()==13 && legacy[0]=='f';
        for (size_t i=1;i<legacy.length();++i) valid&=nibble(legacy[i])>=0;
        Credentials candidate;
        if (parsed && valid && candidate.init(data) && migrate(legacy,candidate.ttn.securityNamespace)) {
          Preferences store;
          if (store.begin("kamue-dual-v3")) {
            stored=store.putBytes("identity",data,sizeof(data))==sizeof(data);
            store.end();
          }
        }
      }
      line=""; overflow=false;
      Serial.println(stored?"PROFILE stored; restarting":"PROFILE rejected");
      if (stored) { delay(200); ESP.restart(); }
    }
  }
 private:
  String line;
  bool overflow=false;
  static int nibble(char c) {
    if (c>='0' && c<='9') return c-'0';
    if (c>='a' && c<='f') return c-'a'+10;
    if (c>='A' && c<='F') return c-'A'+10;
    return -1;
  }
  bool init(const uint8_t* data) {
    if (!ttn.init(data,1) || !control.init(data+50,2) || ttn.eui(10)==control.eui(10)) return false;
    memcpy(group,data+100,36);
    bool app=false,nwk=false;
    for (size_t i=0;i<16;++i) { app|=group[4+i]!=0; nwk|=group[20+i]!=0; }
    return address()>0 && address()<0x02000000 && app && nwk
      && DeviceIdentity::name(group,36,'m',multicastNamespace);
  }
  static bool migrate(const String& legacy,const char* destination) {
    nvs_handle_t handle;
    esp_err_t found=nvs_open(legacy.c_str(),NVS_READONLY,&handle);
    if (found==ESP_ERR_NVS_NOT_FOUND) return true;
    if (found!=ESP_OK) return false;
    nvs_close(handle);
    Preferences old,current;
    if (!old.begin(legacy.c_str(),true)) return false;
    if (!current.begin(destination)) {old.end();return false;}
    bool success=true;
    if (!current.isKey("nonces") && old.isKey("nonces")) {
      uint8_t nonces[RADIOLIB_LORAWAN_NONCES_BUF_SIZE],session[RADIOLIB_LORAWAN_SESSION_BUF_SIZE];
      success=old.getBytes("nonces",nonces,sizeof(nonces))==sizeof(nonces)
        && current.putBytes("nonces",nonces,sizeof(nonces))==sizeof(nonces);
      if (success && old.getBytes("session",session,sizeof(session))==sizeof(session))
        success=current.putBytes("session",session,sizeof(session))==sizeof(session);
    }
    old.end(); current.end(); return success;
  }
};
