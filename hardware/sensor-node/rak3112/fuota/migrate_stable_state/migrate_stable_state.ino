// One-time USB maintenance image. Never joins or transmits, never prints keys.
#include <Arduino.h>
#include <RadioLib.h>
#include <Preferences.h>
#include <mbedtls/sha256.h>
SX1262 radio=new Module(7,47,8,48);
LoRaWANBand_t band=EU868;
LoRaWANNode node(&radio,&band);
void stop(const char* message) {Serial.println(message);while(true) delay(1000);}
uint64_t eui(const uint8_t* data) {
  uint64_t value=0;for(size_t i=0;i<8;++i) value=(value<<8)|data[i];return value;
}
uint32_t little(const uint8_t* data,size_t size) {
  uint32_t value=0;for(size_t i=0;i<size;++i) value|=uint32_t(data[i])<<(8*i);return value;
}
void setup() {
  Serial.begin(115200);delay(2000);
  Preferences identity,old,current;
  uint8_t data[136],digest[32];char destination[14]={ 'l' };
  if(!identity.begin("kamue-dual-v3",true) || identity.getBytes("identity",data,sizeof(data))!=sizeof(data))
    stop("ERROR: dual USB identity missing");
  identity.end();
  if(data[0]!=1 || data[1]!=1 || !eui(data+10)) stop("ERROR: invalid TTN identity");
  if(mbedtls_sha256(data,50,digest,0)!=0) stop("ERROR: identity hash failed");
  for(size_t i=0;i<6;++i) snprintf(destination+1+2*i,3,"%02x",digest[i]);
  if(!old.begin("rak3112lw",true)) stop("ERROR: stable security state missing");
  uint8_t nonces[RADIOLIB_LORAWAN_NONCES_BUF_SIZE],session[RADIOLIB_LORAWAN_SESSION_BUF_SIZE];
  if(old.getBytes("nonces",nonces,sizeof(nonces))!=sizeof(nonces) ||
     old.getBytes("session",session,sizeof(session))!=sizeof(session)) stop("ERROR: stable state incomplete");
  // RadioLib verifies integrity, identity/key checksum, mode and regional plan.
  pinMode(4,OUTPUT);digitalWrite(4,HIGH);SPI.begin(5,3,6,7);
  if(radio.begin(868.1,125,7,5,0x34,14,8,1.6)<0) stop("ERROR: radio initialization failed");
  radio.setDio2AsRfSwitch(true);
  band.txFreqs[1].freq=0;band.txFreqs[2].freq=0;
  if(node.beginOTAA(eui(data+2),eui(data+10),data+34,data+18)<0 ||
     node.setBufferNonces(nonces)<0 || node.setBufferSession(session)<0)
    stop("ERROR: stable security state does not match provisioned identity");
  if(!current.begin(destination)) stop("ERROR: destination unavailable");
  const auto nonceAt=RADIOLIB_LORAWAN_NONCES_DEV_NONCE;
  const auto joinAt=RADIOLIB_LORAWAN_NONCES_JOIN_NONCE;
  if(current.isKey("nonces")) {
    uint8_t existing[sizeof(nonces)];
    if(current.getBytes("nonces",existing,sizeof(existing))!=sizeof(existing)) stop("ERROR: destination state invalid");
    LoRaWANNode check(&radio,&band);
    if(check.beginOTAA(eui(data+2),eui(data+10),data+34,data+18)<0 || check.setBufferNonces(existing)<0)
      stop("ERROR: destination integrity check failed");
    if(little(existing+nonceAt,2)>=little(nonces+nonceAt,2) ||
       little(existing+joinAt,3)>little(nonces+joinAt,3))
      stop("SKIPPED: destination security counters are already at least as new");
  }
  // Advance nonces first: interruption cannot leave a session with lower nonces.
  // RadioLib rejects any mismatched session on the next regular boot.
  if(current.putBytes("nonces",nonces,sizeof(nonces))!=sizeof(nonces) ||
     current.putBytes("session",session,sizeof(session))!=sizeof(session)) stop("ERROR: state copy failed");
  uint8_t verifyNonces[sizeof(nonces)],verifySession[sizeof(session)];
  if(current.getBytes("nonces",verifyNonces,sizeof(verifyNonces))!=sizeof(verifyNonces) ||
     current.getBytes("session",verifySession,sizeof(verifySession))!=sizeof(verifySession) ||
     memcmp(nonces,verifyNonces,sizeof(nonces)) || memcmp(session,verifySession,sizeof(session)))
    stop("ERROR: state readback failed");
  old.end();current.end();
  stop("MIGRATION verified; stable security state retained; restore common firmware A");
}
void loop() {}
