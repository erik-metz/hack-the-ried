// Bring-up stage for the private FUOTA lab. No sensor dependencies.
// Private lab fragment transport on FPort 43; not TS004/TS005.
#include <Arduino.h>
#include <Preferences.h>
#include <RadioLib.h>
#include <esp_ota_ops.h>
#include "build_config.h"
#include "ota_storage.h"
#include "identity_store.h"

#ifndef TEST_FIRMWARE_VERSION
#define TEST_FIRMWARE_VERSION 1
#endif
static_assert(TEST_FIRMWARE_VERSION == 1 || TEST_FIRMWARE_VERSION == 2);
// Both test images keep the same instruction layout, so changing the compiled
// constants does not create thousands of incidental relocation differences.
static volatile const uint16_t TEST_VALUE = TEST_FIRMWARE_VERSION == 1 ? 111 : 222;
static volatile const uint8_t firmwareVersion = TEST_FIRMWARE_VERSION;
SX1262 radio = new Module(7, 47, 8, 48);
LoRaWANBand_t labBand = EU868;
LoRaWANNode node(&radio, &labBand);
Preferences preferences;
IdentityStore identity;
uint32_t counter = 0;
uint32_t nextSend = 0;
bool joined = false;
uint8_t failedJoins = 0;
OtaStorage otaStorage;
lab::Transfer transfer(otaStorage);
lab::Result lastResult = lab::Idle;
bool pendingStatus = false;
uint32_t rebootAt = 0;

void persist() {
  if (preferences.putBytes("nonces", node.getBufferNonces(), RADIOLIB_LORAWAN_NONCES_BUF_SIZE)
      != RADIOLIB_LORAWAN_NONCES_BUF_SIZE
      || preferences.putBytes("session", node.getBufferSession(), RADIOLIB_LORAWAN_SESSION_BUF_SIZE)
      != RADIOLIB_LORAWAN_SESSION_BUF_SIZE) {
    halt("ERROR: could not persist security state; radio halted");
  }
}

void receiveCommand(const uint8_t* data, size_t size, const LoRaWANEvent_t& event) {
  if (event.fPort != 43 || !size) return;
  lastResult = transfer.command(data, size);
  // Bulk data is acknowledged only on explicit STATUS to avoid ACK storms.
  if (data[0] != 2) pendingStatus = true;
  if (lastResult == lab::Applied) rebootAt = millis() + 30000;
  Serial.printf("FUOTA command=%u result=%u blocks=%lu/%u\n", data[0], lastResult,
    (unsigned long)transfer.received, (unsigned)transfer.blocks());
}

void restore() {
  uint8_t nonces[RADIOLIB_LORAWAN_NONCES_BUF_SIZE];
  uint8_t session[RADIOLIB_LORAWAN_SESSION_BUF_SIZE];
  if (!preferences.isKey("nonces")) return;
  if (preferences.getBytes("nonces", nonces, sizeof(nonces)) != sizeof(nonces)) halt("ERROR: stored nonces are corrupt");
  if (node.setBufferNonces(nonces) < 0) halt("ERROR: stored nonces are invalid");
  if (preferences.getBytes("session", session, sizeof(session)) == sizeof(session)) {
    node.setBufferSession(session);
  }
}

void halt(const char* reason) {
  Serial.println(reason);
  while (true) { identity.serialCommand(); delay(5); }
}

void setup() {
  Serial.begin(115200);
  delay(1500);
  Serial.printf("FUOTA-LAB firmware=%u value=%u protocol=lab1\n", firmwareVersion, TEST_VALUE);
  while (!identity.load()) {
    Serial.println("PROFILE missing; provision through USB before radio start");
    for (size_t i=0;i<200;++i) { identity.serialCommand(); delay(5); }
  }
  Serial.printf("DevEUI=%08lx%08lx\n",(unsigned long)(identity.devEui()>>32),(unsigned long)identity.devEui());
  const esp_partition_t* running = esp_ota_get_running_partition();
  const esp_partition_t* target = esp_ota_get_next_update_partition(nullptr);
  Serial.printf("OTA running=%s target=%s size=%lu\n", running ? running->label : "none",
    target ? target->label : "none", target ? (unsigned long)target->size : 0UL);
  if (!target) halt("ERROR: no OTA target partition");
  if (!preferences.begin(identity.securityNamespace)) halt("ERROR: NVS unavailable");
  pinMode(4, OUTPUT);
  digitalWrite(4, HIGH);
  SPI.begin(5, 3, 6, 7);
  if (radio.begin(868.1, 125.0, 7, 5, 0x34, 14, 8, 1.6) != RADIOLIB_ERR_NONE) halt("ERROR: radio init");
  radio.setDio2AsRfSwitch(true);
#if TEST_TTN_SINGLE_CHANNEL
  // Match the existing TTN device profile, including the initial join channel.
  labBand.txFreqs[1].freq = 0;
  labBand.txFreqs[2].freq = 0;
#endif
  if (node.beginOTAA(identity.joinEui(), identity.devEui(), identity.nwkKey(), identity.appKey()) != RADIOLIB_ERR_NONE) halt("ERROR: OTAA init");
  restore();
  node.setADR(true);
  node.setDutyCycle(true);
  node.setDatarate(5);
}

void loop() {
  identity.serialCommand();
  if (!joined) {
    const int16_t state = node.activateOTAA();
    persist();
    joined = state == RADIOLIB_ERR_NONE || state == RADIOLIB_LORAWAN_NEW_SESSION
      || state == RADIOLIB_LORAWAN_SESSION_RESTORED;
    Serial.printf("JOIN state=%d joined=%u\n", state, joined);
    if (!joined) {
      if (++failedJoins >= 3) halt("JOIN paused after 3 failed attempts; restart after checking the gateway downlink path");
      const uint32_t retryAt=millis()+60000UL*failedJoins;
      while ((int32_t)(millis()-retryAt)<0) { identity.serialCommand(); delay(5); }
      return;
    }
    failedJoins = 0;
    if (node.setClass(RADIOLIB_LORAWAN_CLASS_C) != RADIOLIB_ERR_NONE) halt("ERROR: Class C");
  }
  if (rebootAt && (int32_t)(millis() - rebootAt) >= 0 && node.timeUntilUplink()==0) ESP.restart();
  if (pendingStatus && node.timeUntilUplink() == 0) {
    uint8_t status[30], down[255];
    size_t size = sizeof(down);
    LoRaWANEvent_t event = {};
    const size_t length = transfer.status(status, lastResult);
    pendingStatus = false;
    int16_t result = node.sendReceive(status, length, 43, down, &size, false, nullptr, &event);
    persist();
    if (result < 0) pendingStatus = true;
    if (rebootAt && result >= 0) { delay(node.timeUntilUplink()+1000); ESP.restart(); }
    if (result > 0 && size) receiveCommand(down, size, event);
  }
  if (!pendingStatus && !rebootAt && (int32_t)(millis() - nextSend) >= 0 && node.timeUntilUplink() == 0) {
    uint8_t payload[8] = {1, firmwareVersion, uint8_t(TEST_VALUE >> 8), uint8_t(TEST_VALUE),
      uint8_t(counter >> 24), uint8_t(counter >> 16), uint8_t(counter >> 8), uint8_t(counter)};
    uint8_t down[255];
    size_t size = sizeof(down);
    LoRaWANEvent_t event = {};
    int16_t state = node.sendReceive(payload, sizeof(payload), 42, down, &size, false, nullptr, &event);
    persist();
    Serial.printf("UPLINK value=%u counter=%lu state=%d downlink=%u\n", TEST_VALUE, (unsigned long)counter++, state, (unsigned)(state > 0 ? size : 0));
    if (state == RADIOLIB_ERR_NETWORK_NOT_JOINED) joined = false;
    if (state > 0 && size) receiveCommand(down, size, event);
    nextSend = millis() + 300000UL;
  }
  uint8_t data[255];
  size_t size = sizeof(data);
  LoRaWANEvent_t event = {};
  int16_t state = node.getDownlinkClassC(data, &size, &event);
  if (state > 0) {
    persist();
    Serial.printf("CLASS-C port=%u bytes=%u state=%d\n", event.fPort, (unsigned)size, state);
    receiveCommand(data, size, event);
  }
  delay(5);
}
