/*
 * Heltec WiFi LoRa 32 V4.3 - single-channel LoRaWAN development gateway.
 *
 * This is intentionally not a general-purpose TTN gateway: the SX1262 can
 * receive only one frequency/data-rate at a time. Configure it to match the
 * development node under test (EU868 defaults: 868.1 MHz, SF7, BW125).
 *
 * Libraries (Arduino Library Manager): RadioLib, ArduinoJson, TinyGPSPlus,
 * Adafruit GFX, Adafruit SSD1306.
 */

#include <Arduino.h>
#include <WiFi.h>
#include <WiFiUdp.h>
#include <RadioLib.h>
#include <ArduinoJson.h>
#include <TinyGPS++.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "secrets.h"

// ---------- Heltec WiFi LoRa 32 V4.3 ----------
#define VEXT_PIN       36       // active LOW: OLED/peripheral rail
#define OLED_SDA       17
#define OLED_SCL       18
#define OLED_RST       21
#define SCREEN_WIDTH   128
#define SCREEN_HEIGHT  64
#define BAT_ADC_PIN     1
#define BAT_CTRL_PIN   37       // HIGH enables measurement, as on sensor-node/v1

// GPS. GPIO 5 must NOT be used here: it controls the RF FEM on this board.
#define GNSS_PWR_PIN   3
#define GNSS_EN_PIN    34       // active LOW
#define GNSS_WAKE_PIN  40
#define GNSS_RST_PIN   42       // active LOW
#define GPS_RX         38       // ESP32 RX <- L76K TX
#define GPS_TX         39       // ESP32 TX -> L76K RX
#define GPS_BAUD       9600

// SX1262 and KCT8103L FEM
#define LORA_CS        8
#define LORA_SCK       9
#define LORA_MOSI     10
#define LORA_MISO     11
#define LORA_RST      12
#define LORA_BUSY     13
#define LORA_DIO1     14
#define FEM_POWER      7
#define FEM_CSD        2
#define FEM_CTX        5        // LOW = receive/LNA, HIGH = transmit/PA

// Semtech UDP packet-forwarder message identifiers.
#define PUSH_DATA 0x00
#define PUSH_ACK  0x01
#define PULL_DATA 0x02
#define PULL_RESP 0x03
#define PULL_ACK  0x04
#define TX_ACK    0x05

SX1262 radio = new Module(LORA_CS, LORA_DIO1, LORA_RST, LORA_BUSY);
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RST);
HardwareSerial gpsSerial(1);
TinyGPSPlus gps;
WiFiUDP udp;

uint8_t gatewayEui[8];
uint16_t token = 0;
volatile bool packetReceived = false;
uint32_t rxCount = 0;
uint32_t gpsBytes = 0;
uint32_t gpsSentences = 0;
uint32_t lastGpsSentence = 0;
uint32_t lastGpsProbe = 0;
uint8_t gpsProbeIndex = 0;
// Retain the V4 UART pins: the tracker's other candidates overlap OLED,
// GNSS control, or gateway peripherals. Probe only enable level and baud.
const uint32_t gpsProbeBauds[] = { GPS_BAUD, GPS_BAUD, 115200, 115200 };
const uint8_t gpsProbeEnable[] = { LOW, HIGH, LOW, HIGH };
const uint32_t GPS_DATA_TIMEOUT_MS = 15000;
int16_t lastRssi = 0;
float lastSnr = 0;
String statusLine = "Booting";
bool displayReady = false;

void setFlag() { packetReceived = true; }
void setRxMode() { digitalWrite(FEM_CTX, LOW); }
void setTxMode() { digitalWrite(FEM_CTX, HIGH); }

void generateGatewayEui() {
  if (strlen(GATEWAY_EUI) == 16) {
    for (size_t i = 0; i < sizeof(gatewayEui); ++i) {
      char hex[3] = { GATEWAY_EUI[i * 2], GATEWAY_EUI[i * 2 + 1], 0 };
      gatewayEui[i] = static_cast<uint8_t>(strtoul(hex, nullptr, 16));
    }
    return;
  }
  uint8_t mac[6];
  WiFi.macAddress(mac);
  gatewayEui[0] = mac[0]; gatewayEui[1] = mac[1]; gatewayEui[2] = mac[2];
  gatewayEui[3] = 0xFF;   gatewayEui[4] = 0xFF;
  gatewayEui[5] = mac[3]; gatewayEui[6] = mac[4]; gatewayEui[7] = mac[5];
}

void initFEM() {
  pinMode(FEM_POWER, OUTPUT);
  pinMode(FEM_CSD, OUTPUT);
  pinMode(FEM_CTX, OUTPUT);
  digitalWrite(FEM_POWER, HIGH);
  digitalWrite(FEM_CSD, HIGH);
  setRxMode();
  delay(5);
}

void initDisplay() {
  pinMode(VEXT_PIN, OUTPUT);
  digitalWrite(VEXT_PIN, LOW);
  delay(50);
  pinMode(OLED_RST, OUTPUT);
  digitalWrite(OLED_RST, LOW);
  delay(20);
  digitalWrite(OLED_RST, HIGH);
  delay(50);
  Wire.begin(OLED_SDA, OLED_SCL);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println(F("OLED initialization failed"));
    return;
  }
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.display();
  displayReady = true;
}

void initGNSS() {
  // Working sequence from the tracker node (v1.ino), adapted for the gateway.
  // GPIO 5 must NOT be used: it is FEM_CTX on this board.
  // VEXT is already driven LOW by initDisplay(); re-assert it here for safety.
  pinMode(VEXT_PIN, OUTPUT);
  digitalWrite(VEXT_PIN, LOW);
  delay(50);

  pinMode(GNSS_PWR_PIN, OUTPUT);
  digitalWrite(GNSS_PWR_PIN, HIGH);

  pinMode(GNSS_EN_PIN, OUTPUT);
  digitalWrite(GNSS_EN_PIN, LOW);   // active LOW enable for L76K on V4

  pinMode(GNSS_WAKE_PIN, OUTPUT);
  digitalWrite(GNSS_WAKE_PIN, HIGH); // force L76K awake
  delay(100);

  // Active-LOW reset pulse on pin 42 only (pin 5 is FEM_CTX)
  pinMode(GNSS_RST_PIN, OUTPUT);
  digitalWrite(GNSS_RST_PIN, HIGH);
  delay(10);
  digitalWrite(GNSS_RST_PIN, LOW);
  delay(150);
  digitalWrite(GNSS_RST_PIN, HIGH);
  delay(1000);

  gpsSerial.setRxBufferSize(2048);
  gpsSerial.begin(GPS_BAUD, SERIAL_8N1, GPS_RX, GPS_TX);
  delay(50);

  // Quectel L76K PMTK wakeup / exit standby (same as working tracker)
  gpsSerial.println(F("$PMTK000*32"));
  gpsSerial.println(F("$PMTK225,0*2B"));

  lastGpsProbe = millis();
  Serial.println(F("[GNSS] init: VEXT LOW, PWR:3 HIGH, EN:34 LOW, WAKE:40 HIGH, RST:42 pulsed, UART 9600 on RX:38 TX:39"));
}

// Same divider sampling and voltage-based estimate as sensor-node/v1.
float readBatteryVoltage() {
  pinMode(BAT_CTRL_PIN, OUTPUT);
  digitalWrite(BAT_CTRL_PIN, HIGH);
  delay(10);
  uint32_t totalMv = 0;
  const int samples = 10;
  for (int i = 0; i < samples; ++i) {
    totalMv += analogReadMilliVolts(BAT_ADC_PIN);
    delay(2);
  }
  digitalWrite(BAT_CTRL_PIN, LOW);
  return (static_cast<float>(totalMv) / samples) * 4.9f / 1000.0f;
}

int getBatteryPercentage(float v) {
  if (v >= 4.18f) return 100;
  if (v <= 3.30f) return 0;

  int pct = 0;
  if (v >= 4.00f) {
    pct = 90 + (int)((v - 4.00f) / 0.18f * 10.0f);
  } else if (v >= 3.90f) {
    pct = 75 + (int)((v - 3.90f) / 0.10f * 15.0f);
  } else if (v >= 3.80f) {
    pct = 55 + (int)((v - 3.80f) / 0.10f * 20.0f);
  } else if (v >= 3.70f) {
    pct = 35 + (int)((v - 3.70f) / 0.10f * 20.0f);
  } else if (v >= 3.50f) {
    pct = 15 + (int)((v - 3.50f) / 0.20f * 20.0f);
  } else {
    pct = (int)((v - 3.30f) / 0.20f * 15.0f);
  }

  if (pct > 100) return 100;
  if (pct < 0) return 0;
  return pct;
}


void updateDisplay() {
  if (!displayReady) return;
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  const float batteryVolts = readBatteryVoltage();
  display.print(F("Battery: "));
  display.print(batteryVolts, 1); display.print(F("V "));
  display.print(getBatteryPercentage(batteryVolts)); display.print('%');
  display.setCursor(0, 10);
  display.print(F("IP: ")); display.print(WiFi.localIP());
  display.setCursor(0, 20);
  display.print(F("RX:")); display.print(rxCount);
  display.print(F(" R:")); display.print(lastRssi);
  display.print(F(" S:")); display.print(lastSnr, 1);
  display.setCursor(0, 30);
  if (gps.location.isValid() && gps.location.age() < 5000) {
    display.print(gps.location.lat(), 4); display.print(',');
    display.print(gps.location.lng(), 4);
  } else if (gpsSentences == 0 || millis() - lastGpsSentence >= GPS_DATA_TIMEOUT_MS) {
    display.print(F("GPS: no data"));
  } else {
    display.print(F("GPS: searching "));
    display.print(gps.satellites.isValid() && gps.satellites.age() < 5000
        ? gps.satellites.value() : 0);
    display.print(F(" sat"));
  }
  display.setCursor(0, 42);
  display.print(statusLine);
  display.display();
}

String base64Encode(const uint8_t* input, size_t length) {
  static const char alphabet[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  String output;
  output.reserve(4 * ((length + 2) / 3));
  for (size_t i = 0; i < length; i += 3) {
    const size_t remaining = length - i;
    const uint32_t word = (static_cast<uint32_t>(input[i]) << 16) |
        (remaining > 1 ? static_cast<uint32_t>(input[i + 1]) << 8 : 0) |
        (remaining > 2 ? input[i + 2] : 0);
    output += alphabet[(word >> 18) & 0x3F];
    output += alphabet[(word >> 12) & 0x3F];
    output += remaining > 1 ? alphabet[(word >> 6) & 0x3F] : '=';
    output += remaining > 2 ? alphabet[word & 0x3F] : '=';
  }
  return output;
}

int base64Value(char character) {
  if (character >= 'A' && character <= 'Z') return character - 'A';
  if (character >= 'a' && character <= 'z') return character - 'a' + 26;
  if (character >= '0' && character <= '9') return character - '0' + 52;
  if (character == '+') return 62;
  if (character == '/') return 63;
  return -1;
}

size_t decodeBase64(const char* input, uint8_t* output, size_t capacity) {
  size_t outputLength = 0;
  uint32_t word = 0;
  uint8_t symbols = 0;
  uint8_t padding = 0;
  for (const char* p = input; *p; ++p) {
    if (*p == '=') { word <<= 6; ++symbols; ++padding; }
    else {
      const int value = base64Value(*p);
      if (value < 0 || padding) return 0;
      word = (word << 6) | static_cast<uint32_t>(value);
      ++symbols;
    }
    if (symbols == 4) {
      if (padding > 2 || outputLength + 3 - padding > capacity) return 0;
      output[outputLength++] = (word >> 16) & 0xFF;
      if (padding < 2) output[outputLength++] = (word >> 8) & 0xFF;
      if (padding == 0) output[outputLength++] = word & 0xFF;
      word = 0; symbols = 0; padding = 0;
    }
  }
  return symbols == 0 ? outputLength : 0;
}

void addGatewayStatus(JsonDocument& doc) {
  JsonObject stat = doc["stat"].to<JsonObject>();
  stat["rxnb"] = rxCount;
  stat["rxok"] = rxCount;
  if (gps.location.isValid()) {
    stat["lati"] = gps.location.lat();
    stat["long"] = gps.location.lng();
    if (gps.altitude.isValid()) stat["alti"] = gps.altitude.meters();
  }
}

bool sendJson(uint8_t identifier, const JsonDocument& doc) {
  uint8_t packet[1024];
  const size_t jsonLength = measureJson(doc);
  if (jsonLength + 12 > sizeof(packet)) { statusLine = "JSON too large"; return false; }
  packet[0] = 0x02;
  packet[1] = static_cast<uint8_t>(token >> 8);
  packet[2] = static_cast<uint8_t>(token++);
  packet[3] = identifier;
  memcpy(&packet[4], gatewayEui, sizeof(gatewayEui));
  serializeJson(doc, &packet[12], sizeof(packet) - 12);
  if (!udp.beginPacket(LNS_HOST, LNS_PORT)) return false;
  udp.write(packet, 12 + jsonLength);
  return udp.endPacket() == 1;
}

void sendPushData(const uint8_t* payload, size_t length, int16_t rssi, float snr) {
  StaticJsonDocument<1024> doc;
  JsonArray rxpk = doc.createNestedArray("rxpk");
  JsonObject pk = rxpk.createNestedObject();
  pk["tmst"] = micros(); pk["chan"] = 0; pk["rfch"] = 0;
  pk["freq"] = LORA_FREQUENCY; pk["stat"] = 1; pk["modu"] = "LORA";
  char dataRate[16];
  snprintf(dataRate, sizeof(dataRate), "SF%dBW%d", LORA_SF, static_cast<int>(LORA_BW));
  pk["datr"] = dataRate; pk["codr"] = "4/5";
  pk["rssi"] = rssi; pk["lsnr"] = snr; pk["size"] = length;
  pk["data"] = base64Encode(payload, length);
  addGatewayStatus(doc);
  if (doc.overflowed()) { statusLine = "Uplink JSON full"; return; }
  statusLine = sendJson(PUSH_DATA, doc) ? "Uplink forwarded" : "UDP push failed";
}

void sendStatus() {
  StaticJsonDocument<256> doc;
  addGatewayStatus(doc);
  if (!sendJson(PUSH_DATA, doc)) statusLine = "Status UDP fail";
}

void sendPullData() {
  uint8_t packet[12] = { 0x02, static_cast<uint8_t>(token >> 8),
      static_cast<uint8_t>(token), PULL_DATA };
  ++token;
  memcpy(&packet[4], gatewayEui, sizeof(gatewayEui));
  if (udp.beginPacket(LNS_HOST, LNS_PORT)) { udp.write(packet, sizeof(packet)); udp.endPacket(); }
}

bool sendTxAck(uint16_t responseToken, const char* error) {
  uint8_t packet[96] = { 0x02, static_cast<uint8_t>(responseToken >> 8),
      static_cast<uint8_t>(responseToken), TX_ACK };
  memcpy(&packet[4], gatewayEui, sizeof(gatewayEui));
  size_t packetLength = 12;

  // Semtech UDP TX_ACK packets include the gateway EUI in bytes 4–11.
  // A successful acknowledgement has no JSON body; errors carry txpk_ack.
  if (strcmp(error, "NONE") != 0) {
    char json[80];
    const int jsonLength = snprintf(json, sizeof(json),
        "{\"txpk_ack\":{\"error\":\"%s\"}}", error);
    if (jsonLength <= 0 || static_cast<size_t>(jsonLength) + packetLength > sizeof(packet)) return false;
    memcpy(&packet[packetLength], json, jsonLength);
    packetLength += static_cast<size_t>(jsonLength);
  }

  if (!udp.beginPacket(LNS_HOST, LNS_PORT)) return false;
  const size_t written = udp.write(packet, packetLength);
  const bool sent = udp.endPacket() == 1 && written == packetLength;
  Serial.printf("[UDP] TX_ACK error=%s sent=%s bytes=%u\n", error,
      sent ? "yes" : "no", static_cast<unsigned>(packetLength));
  return sent;
}

bool parseDataRate(const char* dataRate, int& sf, float& bandwidth) {
  int bandwidthKHz = 0;
  if (!dataRate || sscanf(dataRate, "SF%dBW%d", &sf, &bandwidthKHz) != 2) return false;
  bandwidth = static_cast<float>(bandwidthKHz);
  return sf >= 5 && sf <= 12 && bandwidth > 0;
}

void resumeReceive() {
  radio.setFrequency(LORA_FREQUENCY);
  radio.setSpreadingFactor(LORA_SF);
  radio.setBandwidth(LORA_BW);
  radio.setCodingRate(LORA_CR);
  radio.setPreambleLength(LORA_PREAMBLE);
  radio.setSyncWord(LORA_SYNC_WORD);
  radio.setCRC(true);
  setRxMode();
  if (radio.startReceive() != RADIOLIB_ERR_NONE) statusLine = "RX restart failed";
}

void handlePullResponse(uint16_t responseToken, const uint8_t* buffer, size_t length) {
  StaticJsonDocument<768> doc;
  if (deserializeJson(doc, buffer, length)) {
    Serial.println(F("[DOWNLINK][ERROR] PULL_RESP JSON ungültig."));
    sendTxAck(responseToken, "COLLISION_PACKET"); statusLine = "Bad downlink JSON"; return;
  }
  JsonObject txpk = doc["txpk"];
  const char* encoded = txpk["data"];
  const char* dataRate = txpk["datr"];
  const char* codingRate = txpk["codr"] | "4/5";
  int sf = 0; float bandwidth = 0;
  if (!encoded || !parseDataRate(dataRate, sf, bandwidth)) {
    Serial.println(F("[DOWNLINK][ERROR] PULL_RESP ohne unterstützte Datenrate/Payload."));
    sendTxAck(responseToken, "TX_FREQ"); statusLine = "Unsupported downlink"; return;
  }
  const float frequency = txpk["freq"] | 0.0f;
  if (fabsf(frequency - LORA_FREQUENCY) > 0.001f || sf != LORA_SF ||
      fabsf(bandwidth - LORA_BW) > 0.1f || strcmp(codingRate, "4/5") != 0) {
    Serial.printf("[DOWNLINK][ERROR] Konfiguration passt nicht: %.3f MHz SF%d BW%.0f CR%s.\n",
        frequency, sf, bandwidth, codingRate);
    sendTxAck(responseToken, "TX_FREQ"); statusLine = "DL outside SC config"; return;
  }
  uint8_t payload[255];
  const size_t decoded = decodeBase64(encoded, payload, sizeof(payload));
  if (decoded == 0 && strlen(encoded) != 0) {
    Serial.println(F("[DOWNLINK][ERROR] PULL_RESP Base64-Daten ungültig."));
    sendTxAck(responseToken, "COLLISION_PACKET"); statusLine = "Bad downlink data"; return;
  }
  const bool immediate = txpk["imme"] | false;
  const uint32_t txTimestamp = txpk["tmst"] | 0U;
  if (!immediate && static_cast<int32_t>(txTimestamp - micros()) < -100000) {
    Serial.println(F("[DOWNLINK][ERROR] PULL_RESP kam nach dem Sendezeitpunkt an."));
    sendTxAck(responseToken, "TOO_LATE"); statusLine = "Downlink too late"; return;
  }
  radio.standby();
  radio.setFrequency(frequency); radio.setSpreadingFactor(sf); radio.setBandwidth(bandwidth);
  radio.setCodingRate(5); radio.setPreambleLength(LORA_PREAMBLE);
  radio.setSyncWord(LORA_SYNC_WORD); radio.setCRC(true);
  if (!immediate) {
    while (static_cast<int32_t>(txTimestamp - micros()) > 2000) delay(1);
    while (static_cast<int32_t>(txTimestamp - micros()) > 0) delayMicroseconds(50);
  }
  setTxMode();
  const int state = radio.transmit(payload, decoded);
  const char* txAckError = state == RADIOLIB_ERR_NONE ? "NONE" : "TX_POWER";
  const bool ackSent = sendTxAck(responseToken, txAckError);
  Serial.printf("[DOWNLINK] TX result=%d payload=%u bytes; ACK datagram=%s.\n",
      state, static_cast<unsigned>(decoded), ackSent ? "sent" : "failed");
  statusLine = state == RADIOLIB_ERR_NONE ? "Downlink sent" : "Downlink failed";
  resumeReceive();
}

void processGps() {
  while (gpsSerial.available() > 0) {
    const char c = gpsSerial.read();
    ++gpsBytes;
    if (gps.encode(c)) {
      ++gpsSentences;
      lastGpsSentence = millis();
    }
  }

  const uint32_t now = millis();
  // Valid NMEA without a satellite fix means the receiver is working. Leave
  // it powered and acquiring; only probe when the serial stream is absent.
  if ((gpsSentences == 0 || now - lastGpsSentence >= GPS_DATA_TIMEOUT_MS) &&
      now - lastGpsProbe >= GPS_DATA_TIMEOUT_MS) {
    gpsProbeIndex = (gpsProbeIndex + 1) %
        (sizeof(gpsProbeBauds) / sizeof(gpsProbeBauds[0]));
    Serial.printf("[GNSS][AUTO_PROBE] No valid NMEA: bytes=%lu, checksums_failed=%lu; baud=%lu RX=%d TX=%d EN=%s\n",
        static_cast<unsigned long>(gpsBytes),
        static_cast<unsigned long>(gps.failedChecksum()),
        static_cast<unsigned long>(gpsProbeBauds[gpsProbeIndex]), GPS_RX, GPS_TX,
        gpsProbeEnable[gpsProbeIndex] == LOW ? "LOW" : "HIGH");

    gpsSerial.end();
    // Discard partial sentences and stale fixes when changing configuration.
    gps = TinyGPSPlus();
    pinMode(VEXT_PIN, OUTPUT);
    digitalWrite(VEXT_PIN, LOW);
    pinMode(GNSS_PWR_PIN, OUTPUT);
    digitalWrite(GNSS_PWR_PIN, HIGH);
    pinMode(GNSS_EN_PIN, OUTPUT);
    digitalWrite(GNSS_EN_PIN, gpsProbeEnable[gpsProbeIndex]);
    pinMode(GNSS_WAKE_PIN, OUTPUT);
    digitalWrite(GNSS_WAKE_PIN, HIGH);
    delay(150);
    gpsSerial.setRxBufferSize(2048);
    gpsSerial.begin(gpsProbeBauds[gpsProbeIndex], SERIAL_8N1, GPS_RX, GPS_TX);
    delay(50);
    gpsSerial.println(F("$PMTK000*32"));
    gpsSerial.println(F("$PMTK225,0*2B"));
    lastGpsProbe = millis();
  }

  static uint32_t lastGpsLog = 0;
  if (now - lastGpsLog >= 5000) {
    lastGpsLog = now;
    Serial.printf("[GNSS] bytes=%lu valid=%lu failed=%lu satellites=%lu fix=%s baud=%lu EN=%s\n",
        static_cast<unsigned long>(gpsBytes), static_cast<unsigned long>(gpsSentences),
        static_cast<unsigned long>(gps.failedChecksum()),
        static_cast<unsigned long>(gps.satellites.value()),
        gps.location.isValid() && gps.location.age() < 5000 ? "yes" : "no",
        static_cast<unsigned long>(gpsProbeBauds[gpsProbeIndex]),
        gpsProbeEnable[gpsProbeIndex] == LOW ? "LOW" : "HIGH");
  }
}

void processUdp() {
  const int packetSize = udp.parsePacket();
  if (packetSize <= 0) return;
  uint8_t buffer[1024];
  const int length = udp.read(buffer, min(packetSize, static_cast<int>(sizeof(buffer))));
  if (length < 4) return;
  const uint16_t responseToken = (static_cast<uint16_t>(buffer[1]) << 8) | buffer[2];
  if (buffer[3] == PULL_ACK) {
    statusLine = "TTN connected";
    static bool loggedPullAck = false;
    if (!loggedPullAck) {
      Serial.println(F("[UDP] PULL_ACK: TTN gateway connection active."));
      loggedPullAck = true;
    }
  }
  else if (buffer[3] == PUSH_ACK) statusLine = "TTN uplink ACK";
  else if (buffer[3] == PULL_RESP) {
    Serial.printf("[UDP] PULL_RESP received (%d bytes).\n", length);
    handlePullResponse(responseToken, &buffer[4], length - 4);
  }
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println(F("\n=== Heltec V4.3 single-channel TTN development gateway ==="));
  initFEM(); initDisplay(); initGNSS();
  statusLine = "Connecting WiFi"; updateDisplay();
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  for (int retries = 0; WiFi.status() != WL_CONNECTED && retries < 40; ++retries) {
    // Keep the GPS UART drained while WiFi connects.
    processGps();
    delay(500);
  }
  if (WiFi.status() != WL_CONNECTED) {
    statusLine = "WiFi failed; reboot"; updateDisplay(); delay(3000); ESP.restart();
  }
  generateGatewayEui();
  udp.begin(1700);
  SPI.begin(LORA_SCK, LORA_MISO, LORA_MOSI, LORA_CS);
  const int state = radio.begin(LORA_FREQUENCY);
  if (state != RADIOLIB_ERR_NONE) {
    statusLine = "Radio init failed"; Serial.printf("SX1262 init failed: %d\n", state);
    updateDisplay(); while (true) delay(1000);
  }
  radio.setTCXO(1.6);
  radio.setDio2AsRfSwitch(true);
  radio.setOutputPower(LORA_POWER);
  radio.setPacketReceivedAction(setFlag);
  resumeReceive();
  Serial.print(F("Gateway EUI: "));
  for (uint8_t byte : gatewayEui) Serial.printf("%02X", byte);
  Serial.println();
  sendPullData(); sendStatus();
  statusLine = "Listening"; updateDisplay();
}

void loop() {
  static uint32_t lastPull = 0, lastStatus = 0, lastDisplay = 0;
  processGps();
  processUdp();
  if (packetReceived) {
    packetReceived = false;
    uint8_t payload[255];
    const size_t length = radio.getPacketLength();
    const int readState = length <= sizeof(payload) ? radio.readData(payload, length) : RADIOLIB_ERR_PACKET_TOO_LONG;
    if (readState == RADIOLIB_ERR_NONE) {
      lastRssi = radio.getRSSI(); lastSnr = radio.getSNR(); ++rxCount;
      sendPushData(payload, length, lastRssi, lastSnr);
    } else {
      statusLine = "Bad uplink packet";
    }
    resumeReceive();
  }
  if (millis() - lastPull >= 5000) { sendPullData(); lastPull = millis(); }
  if (millis() - lastStatus >= 30000) { sendStatus(); lastStatus = millis(); }
  if (millis() - lastDisplay >= 1000) { updateDisplay(); lastDisplay = millis(); }
  delay(2);
}
