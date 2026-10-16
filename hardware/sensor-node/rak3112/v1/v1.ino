/*
 * RAK3112 on the RAK3212 breakout: first LoRaWAN bring-up for TTN.
 *
 * The initial uplink is intentionally small and contains only a format
 * version, uptime in seconds, and an incrementing packet counter. No sensor
 * is required. Copy secrets.h.example to secrets.h and enter this device's
 * own TTN OTAA credentials before enabling the network join.
 */

#include <Arduino.h>
#include <Preferences.h>
#include <RadioLib.h>

#if __has_include("secrets.h")
#include "secrets.h"
#define HAS_LORAWAN_CREDENTIALS 1
#else
// Allows the USB and radio hardware checks to compile before TTN credentials
// have been provisioned. OTAA is deliberately disabled in this state.
static constexpr char joinEUIHex[] = "";
static constexpr char devEUIHex[] = "";
static constexpr char nwkKeyHex[] = "";
static constexpr char appKeyHex[] = "";
#define HAS_LORAWAN_CREDENTIALS 0
#endif

static uint8_t nwkKey[16] = {};
static uint8_t appKey[16] = {};
static uint64_t joinEUI = 0;
static uint64_t devEUI = 0;

// RAK3112 internal SX1262 wiring (not the Heltec pin map).
static constexpr int8_t LORA_NSS = 7;
static constexpr int8_t LORA_SCK = 5;
static constexpr int8_t LORA_MOSI = 6;
static constexpr int8_t LORA_MISO = 3;
static constexpr int8_t LORA_RESET = 8;
static constexpr int8_t LORA_DIO1 = 47;
static constexpr int8_t LORA_BUSY = 48;

static constexpr uint32_t SERIAL_BAUD = 115200;
static constexpr uint32_t UPLINK_INTERVAL_MS = 5UL * 60UL * 1000UL;
static constexpr uint8_t UPLINK_FPORT = 10;

SX1262 radio = new Module(LORA_NSS, LORA_DIO1, LORA_RESET, LORA_BUSY);
LoRaWANBand_t singleChannelEU868;
LoRaWANNode* node = nullptr;
Preferences preferences;

bool radioReady = false;
bool joined = false;
uint32_t packetCounter = 0;
uint32_t lastUplinkMs = 0;

int8_t hexNibble(char value) {
  if (value >= '0' && value <= '9') return value - '0';
  if (value >= 'a' && value <= 'f') return value - 'a' + 10;
  if (value >= 'A' && value <= 'F') return value - 'A' + 10;
  return -1;
}

bool isHexSeparator(char value) {
  return value == ' ' || value == '\t' || value == '\r' || value == '\n' ||
      value == ':' || value == '-';
}

bool parseKey(const char* text, uint8_t output[16]) {
  while (isHexSeparator(*text)) ++text;
  if (text[0] == '0' && (text[1] == 'x' || text[1] == 'X')) text += 2;

  for (uint8_t i = 0; i < 16; ++i) {
    while (isHexSeparator(*text)) ++text;
    const int8_t high = hexNibble(*text++);
    while (isHexSeparator(*text)) ++text;
    const int8_t low = hexNibble(*text++);
    if (high < 0 || low < 0) return false;
    output[i] = static_cast<uint8_t>((high << 4) | low);
  }

  while (isHexSeparator(*text)) ++text;
  return *text == '\0';
}

bool parseEui(const char* text, uint64_t& output) {
  while (isHexSeparator(*text)) ++text;
  if (text[0] == '0' && (text[1] == 'x' || text[1] == 'X')) text += 2;

  uint64_t value = 0;
  for (uint8_t i = 0; i < 16; ++i) {
    while (isHexSeparator(*text)) ++text;
    const int8_t nibble = hexNibble(*text++);
    if (nibble < 0) return false;
    value = (value << 4) | static_cast<uint64_t>(nibble);
  }

  while (isHexSeparator(*text)) ++text;
  if (*text != '\0') return false;
  output = value;
  return true;
}

bool credentialsConfigured() {
#if HAS_LORAWAN_CREDENTIALS
  if (!parseEui(joinEUIHex, joinEUI) || !parseEui(devEUIHex, devEUI)) return false;
  // An all-zero JoinEUI is valid for a DIY device; the DevEUI must be set.
  if (devEUI == 0) return false;
  if (!parseKey(appKeyHex, appKey) || !parseKey(nwkKeyHex, nwkKey)) return false;
  for (uint8_t i = 0; i < sizeof(appKey); ++i) {
    if (appKey[i] != 0 || nwkKey[i] != 0) return true;
  }
#endif
  return false;
}

void printHex64(uint64_t value) {
  Serial.printf("%08lX%08lX",
      static_cast<unsigned long>(value >> 32),
      static_cast<unsigned long>(value & 0xFFFFFFFFULL));
}

void persistLoRaWANSecurityState() {
  uint8_t nonceBuffer[RADIOLIB_LORAWAN_NONCES_BUF_SIZE];
  uint8_t* nonces = node->getBufferNonces();
  if (nonces != nullptr) {
    memcpy(nonceBuffer, nonces, sizeof(nonceBuffer));
    if (preferences.putBytes("nonces", nonceBuffer, sizeof(nonceBuffer)) != sizeof(nonceBuffer)) {
      Serial.println(F("[LORAWAN][WARNUNG] Nonce-Zustand konnte nicht vollstaendig gespeichert werden."));
    }
  }

  uint8_t buffer[RADIOLIB_LORAWAN_SESSION_BUF_SIZE];
  uint8_t* session = node->getBufferSession();
  if (session == nullptr) return;
  memcpy(buffer, session, sizeof(buffer));
  if (preferences.putBytes("session", buffer, sizeof(buffer)) != sizeof(buffer)) {
    Serial.println(F("[LORAWAN][WARNUNG] Sitzung konnte nicht vollstaendig gespeichert werden."));
  }
}

void restoreLoRaWANSession() {
  uint8_t nonceBuffer[RADIOLIB_LORAWAN_NONCES_BUF_SIZE];
  const size_t nonceSize = preferences.getBytes("nonces", nonceBuffer, sizeof(nonceBuffer));
  if (nonceSize != sizeof(nonceBuffer)) {
    Serial.println(F("[LORAWAN] Kein gespeicherter Nonce-Zustand; frischer OTAA-Join."));
    return;
  }

  const int16_t nonceState = node->setBufferNonces(nonceBuffer);
  if (nonceState < RADIOLIB_ERR_NONE) {
    Serial.printf("[LORAWAN][WARNUNG] Nonces verworfen: %d; Sitzung wird nicht geladen.\n",
        nonceState);
    return;
  }

  uint8_t sessionBuffer[RADIOLIB_LORAWAN_SESSION_BUF_SIZE];
  const size_t sessionSize = preferences.getBytes("session", sessionBuffer, sizeof(sessionBuffer));
  if (sessionSize != sizeof(sessionBuffer)) {
    Serial.println(F("[LORAWAN] Nonces wiederhergestellt; keine Sitzung gespeichert."));
    return;
  }

  const int16_t sessionState = node->setBufferSession(sessionBuffer);
  if (sessionState == RADIOLIB_ERR_NONE) {
    Serial.println(F("[LORAWAN] Nonces und Sitzung wiederhergestellt."));
  } else {
    Serial.printf("[LORAWAN][WARNUNG] Sitzung nicht wiederhergestellt: %d; OTAA-Join erforderlich.\n",
        sessionState);
  }
}

bool initRadio() {
  Serial.println(F("[RADIO] Initialisiere SPI (SCK=5, MISO=3, MOSI=6, NSS=7)..."));
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_NSS);

  Serial.println(F("[RADIO] Initialisiere SX1262 (EU868, TCXO 1.6 V)..."));
  const int16_t state = radio.begin(868.1, 125.0, 7, 5, 0x34, 14, 8, 1.6);
  if (state != RADIOLIB_ERR_NONE) {
    Serial.printf("[RADIO][FEHLER] SX1262 init fehlgeschlagen: %d\n", state);
    return false;
  }

  // The RAK3112 routes RF antenna switching to SX1262 DIO2 internally.
  radio.setDio2AsRfSwitch(true);
  Serial.println(F("[RADIO] SX1262 bereit."));
  return true;
}

bool joinNetwork() {
  if (!credentialsConfigured()) {
    Serial.println(F("[LORAWAN] OTAA aus: secrets.h fehlt oder enthält Platzhalter."));
    Serial.println(F("[LORAWAN] secrets.h.example als secrets.h kopieren; OTAA 1.1 benoetigt NwkKey und AppKey als 32-stellige Hex-Strings."));
    return false;
  }

  const int16_t beginState = node->beginOTAA(joinEUI, devEUI, nwkKey, appKey);
  if (beginState != RADIOLIB_ERR_NONE) {
    Serial.printf("[LORAWAN][FEHLER] OTAA-Konfiguration fehlgeschlagen: %d\n", beginState);
    return false;
  }
  restoreLoRaWANSession();

  // Match the single-channel Heltec development gateway (868.1 MHz, SF7).
  // Keep ADR disabled until moving to a multi-channel LoRaWAN gateway.
  node->setADR(false);
  const int16_t dataRateState = node->setDatarate(5);  // EU868 DR5 = SF7/BW125
  if (dataRateState != RADIOLIB_ERR_NONE) {
    Serial.printf("[LORAWAN][FEHLER] SF7-Datenrate konnte nicht gesetzt werden: %d\n",
        dataRateState);
    return false;
  }

  Serial.print(F("[LORAWAN] OTAA-Join mit DevEUI "));
  printHex64(devEUI);
  Serial.println(F(" ..."));

  const int16_t state = node->activateOTAA();
  persistLoRaWANSecurityState();
  if (state != RADIOLIB_ERR_NONE && state != RADIOLIB_LORAWAN_NEW_SESSION && state <= 0) {
    Serial.printf("[LORAWAN][FEHLER] Join fehlgeschlagen: %d\n", state);
    return false;
  }

  Serial.println(F("[LORAWAN] Join erfolgreich."));
  return true;
}

void sendStatusUplink() {
  // Payload v1 (7 bytes), big-endian: version, uptime_seconds, packet_counter.
  uint8_t payload[7];
  const uint32_t uptimeSeconds = millis() / 1000UL;
  ++packetCounter;
  payload[0] = 1;
  payload[1] = static_cast<uint8_t>(uptimeSeconds >> 24);
  payload[2] = static_cast<uint8_t>(uptimeSeconds >> 16);
  payload[3] = static_cast<uint8_t>(uptimeSeconds >> 8);
  payload[4] = static_cast<uint8_t>(uptimeSeconds);
  payload[5] = static_cast<uint8_t>(packetCounter >> 8);
  payload[6] = static_cast<uint8_t>(packetCounter);

  Serial.printf("[UPLINK] FPort=%u, version=%u, uptime=%lu s, counter=%lu\n",
      UPLINK_FPORT, payload[0], static_cast<unsigned long>(uptimeSeconds),
      static_cast<unsigned long>(packetCounter));

  uint8_t downlink[16];
  size_t downlinkLength = sizeof(downlink);
  const int16_t state = node->sendReceive(payload, sizeof(payload), UPLINK_FPORT,
      downlink, &downlinkLength);
  persistLoRaWANSecurityState();
  if (state < RADIOLIB_ERR_NONE) {
    Serial.printf("[UPLINK][FEHLER] Senden/Empfang fehlgeschlagen: %d\n", state);
  } else {
    Serial.println(F("[UPLINK] Nachricht an LoRaWAN-Stack übergeben."));
    if (downlinkLength > 0) {
      Serial.printf("[DOWNLINK] %u Byte empfangen.\n", static_cast<unsigned>(downlinkLength));
    }
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(1200);
  Serial.println();
  Serial.println(F("=== KAMÜ RAK3112 / RAK3212 LoRaWAN Bring-up v1 ==="));
  Serial.printf("[SYSTEM] ESP32-S3, CPU %u MHz, freier Heap %u Byte\n",
      ESP.getCpuFreqMHz(), ESP.getFreeHeap());
  Serial.printf("[SYSTEM] Flash %u MB, PSRAM %u Byte\n",
      ESP.getFlashChipSize() / (1024U * 1024U), ESP.getPsramSize());

  radioReady = initRadio();
  if (!radioReady) return;

  // The development gateway listens only on 868.1 MHz. Disable the other
  // two mandatory EU868 default channels so JoinRequests use its channel.
  singleChannelEU868 = EU868;
  singleChannelEU868.txFreqs[1].freq = 0;
  singleChannelEU868.txFreqs[2].freq = 0;
  node = new LoRaWANNode(&radio, &singleChannelEU868);
  if (node == nullptr) {
    Serial.println(F("[LORAWAN][FEHLER] LoRaWAN-Stack konnte nicht angelegt werden."));
    return;
  }

  if (!credentialsConfigured()) {
    Serial.println(F("[SYSTEM] Hardwaretest abgeschlossen; noch kein Funk-Join."));
    return;
  }

  preferences.begin("rak3112lw", false);
  joined = joinNetwork();
  if (joined) {
    sendStatusUplink();
    lastUplinkMs = millis();
  }
}

void loop() {
  static uint32_t lastStatusMs = 0;
  if (millis() - lastStatusMs >= 5000) {
    lastStatusMs = millis();
    Serial.printf("[STATUS] uptime=%lu s, radio=%s, credentials=%s, joined=%s\n",
        static_cast<unsigned long>(millis() / 1000UL),
        radioReady ? "ready" : "error",
        credentialsConfigured() ? "configured" : "missing",
        joined ? "yes" : "no");
  }
  if (joined && millis() - lastUplinkMs >= UPLINK_INTERVAL_MS) {
    lastUplinkMs = millis();
    sendStatusUplink();
  }
  delay(20);
}
