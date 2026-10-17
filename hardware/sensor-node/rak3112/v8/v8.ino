/*
 * RAK3112 / RAK3212 with SHT41, SGP41, SCD41 and LTR390 on SDA=GPIO14, SCL=GPIO13.
 *
 * Firmware version 8 adds LTR390 UV-index and ambient-light readings to firmware v7.
 * The build helper injects a per-device secrets.h outside the repository.
 */

#include <Arduino.h>
#include <Preferences.h>
#include <RadioLib.h>
#include <Wire.h>
#include "sensirion_gas_index_algorithm.h"

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
static constexpr int8_t LORA_ANT_SWITCH_POWER = 4;
static constexpr int8_t LORA_DIO1 = 47;
static constexpr int8_t LORA_BUSY = 48;

static constexpr uint32_t SERIAL_BAUD = 115200;
static constexpr uint32_t UPLINK_INTERVAL_MS = 5UL * 60UL * 1000UL;
static constexpr uint32_t JOIN_RETRY_BASE_MS = 60UL * 1000UL;
static constexpr uint32_t JOIN_RETRY_MAX_MS = 30UL * 60UL * 1000UL;
static constexpr uint8_t UPLINK_FPORT = 10;
static constexpr uint8_t FIRMWARE_VERSION = 8;
static constexpr uint8_t PAYLOAD_VERSION = 4;
static constexpr uint8_t PAYLOAD_HEADER_BYTES = 2;
static constexpr size_t MAX_MEASUREMENTS = 41;
static constexpr size_t MAX_UPLINK_BYTES = PAYLOAD_HEADER_BYTES + MAX_MEASUREMENTS * 5;

// Shared I2C configuration
static constexpr int8_t I2C_SDA_PIN = 14;
static constexpr int8_t I2C_SCL_PIN = 13;
static constexpr uint8_t SHT41_ADDRESS = 0x44;
static constexpr uint8_t SGP41_ADDRESS = 0x59;
static constexpr uint8_t SCD41_ADDRESS = 0x62;
static constexpr uint8_t LTR390_ADDRESS = 0x53;

static constexpr uint8_t SHT41_MEASURE_HIGH_PRECISION = 0xFD;
static constexpr uint32_t SGP41_SAMPLE_INTERVAL_MS = 1000;
static constexpr uint32_t SGP41_CONDITIONING_MS = 10000;
static constexpr uint8_t LTR390_MAIN_CTRL = 0x00;
static constexpr uint8_t LTR390_MEAS_RATE = 0x04;
static constexpr uint8_t LTR390_GAIN = 0x05;
static constexpr uint8_t LTR390_PART_ID = 0x06;
static constexpr uint8_t LTR390_MAIN_STATUS = 0x07;
static constexpr uint8_t LTR390_ALS_DATA = 0x0D;
static constexpr uint8_t LTR390_UVS_DATA = 0x10;
static constexpr uint8_t LTR390_DATA_READY = 0x08;
static constexpr uint8_t LTR390_SENSOR_ENABLE = 0x02;
static constexpr uint8_t LTR390_UVS_MODE = 0x08;
static constexpr float LTR390_GAIN_FACTOR = 3.0f;
static constexpr float LTR390_INTEGRATION_FACTOR = 1.0f; // 18-bit / 100 ms
static constexpr float LTR390_COUNTS_PER_UVI = 2300.0f * (3.0f / 18.0f) * (100.0f / 400.0f);

// Metric codes are part of the RAK-to-TTN wire protocol. Values are signed
// 32-bit integers; each code defines its own scale and unit (see README).
enum MetricCode : uint8_t {
  METRIC_TEMPERATURE = 1,
  METRIC_HUMIDITY = 2,
  METRIC_UV_INDEX = 3,
  METRIC_CO2 = 4,
  METRIC_SCD41_TEMPERATURE = 5,
  METRIC_SCD41_HUMIDITY = 6,
  METRIC_SOUND_LEVEL = 7,
  METRIC_PM1_0 = 8,
  METRIC_PM2_5 = 9,
  METRIC_PM4_0 = 10,
  METRIC_PM10 = 11,
  METRIC_PARTICLE_NUMBER_PM0_5 = 12,
  METRIC_PARTICLE_NUMBER_PM1_0 = 13,
  METRIC_PARTICLE_NUMBER_PM2_5 = 14,
  METRIC_PARTICLE_NUMBER_PM4_0 = 15,
  METRIC_PARTICLE_NUMBER_PM10 = 16,
  METRIC_PARTICLE_SIZE_TYPICAL = 17,
  METRIC_BME688_TEMPERATURE = 18,
  METRIC_BME688_HUMIDITY = 19,
  METRIC_PRESSURE = 20,
  METRIC_BME688_GAS_RESISTANCE = 21,
  METRIC_BME688_IAQ = 22,
  METRIC_BME688_STATIC_IAQ = 23,
  METRIC_BME688_CO2_EQUIVALENT = 24,
  METRIC_BME688_BVOC_EQUIVALENT = 25,
  METRIC_BME688_GAS_PERCENTAGE = 26,
  // Codes 27 and 28 were used for raw SGP41 signals in older firmware.
  METRIC_SGP41_VOC_INDEX = 29,
  METRIC_SGP41_NOX_INDEX = 30,
  METRIC_AMBIENT_LIGHT = 31,
  METRIC_LTR390_UV_RAW = 32,
  METRIC_LTR390_ALS_RAW = 33,
  METRIC_RAIN_DETECTED = 34,
  METRIC_RAIN_PULSES = 35,
  METRIC_BUS_VOLTAGE = 36,
  METRIC_SHUNT_VOLTAGE = 37,
  METRIC_CURRENT = 38,
  METRIC_POWER = 39,
  METRIC_SOUND_DOMINANT_FREQUENCY = 40,
  METRIC_SOUND_EVENT_CLASS = 41,
};

struct EncodedMeasurement {
  uint8_t code;
  int32_t value;
};

SX1262 radio = new Module(LORA_NSS, LORA_DIO1, LORA_RESET, LORA_BUSY);
LoRaWANBand_t singleChannelEU868;
LoRaWANNode* node = nullptr;
Preferences preferences;

bool radioReady = false;
bool joined = false;
bool sgp41Ready = false;
bool sgp41Conditioning = false;
bool scd41Ready = false;
bool ltr390Ready = false;
bool ltr390UvMode = false;
bool haveLtr390UvSample = false;
bool haveLtr390AlsSample = false;
bool initialUplinkPending = false;
bool haveSht41Sample = false;
bool haveSgp41Sample = false;
bool haveScd41Sample = false;
bool sht41ErrorLogged = false;
bool defaultCompensationLogged = false;

int32_t latestTemperatureTenths = 0;
int32_t latestHumidityTenths = 0;
int32_t latestSgp41VocIndex = 0;
int32_t latestSgp41NoxIndex = 0;
int32_t latestCo2Ppm = 0;
int32_t latestScd41TemperatureHundredths = 0;
int32_t latestScd41HumidityHundredths = 0;
int32_t latestLtr390UvRaw = 0;
int32_t latestLtr390AlsRaw = 0;

GasIndexAlgorithmParams sgp41VocAlgorithm;
GasIndexAlgorithmParams sgp41NoxAlgorithm;
uint32_t sgp41ConditioningStartMs = 0;
uint32_t nextSampleMs = 0;
uint32_t lastUplinkMs = 0;
uint32_t nextJoinAttemptMs = 0;
uint8_t joinRetryCount = 0;

// Sensirion CRC-8 (polynomial 0x31, init 0xFF) used by SHT4x, SGP4x, and SCD4x
uint8_t sensirionCrc8(const uint8_t* data, size_t length) {
  uint8_t crc = 0xFF;
  for (size_t i = 0; i < length; ++i) {
    crc ^= data[i];
    for (uint8_t bit = 0; bit < 8; ++bit) {
      crc = (crc & 0x80) ? static_cast<uint8_t>((crc << 1) ^ 0x31) : static_cast<uint8_t>(crc << 1);
    }
  }
  return crc;
}

// ---------------------------------------------------------------------------
// SHT41 Functions
// ---------------------------------------------------------------------------
bool readSht41(int32_t& temperatureTenths, int32_t& humidityTenths) {
  Wire.beginTransmission(SHT41_ADDRESS);
  Wire.write(SHT41_MEASURE_HIGH_PRECISION);
  if (Wire.endTransmission() != 0) return false;
  delay(10);
  uint8_t sample[6];
  if (Wire.requestFrom(SHT41_ADDRESS, static_cast<uint8_t>(sizeof(sample))) != sizeof(sample)) return false;
  for (uint8_t& byte : sample) byte = Wire.read();
  if (sensirionCrc8(sample, 2) != sample[2] || sensirionCrc8(sample + 3, 2) != sample[5]) return false;

  const uint16_t rawTemperature = (static_cast<uint16_t>(sample[0]) << 8) | sample[1];
  const uint16_t rawHumidity = (static_cast<uint16_t>(sample[3]) << 8) | sample[4];
  const float temperature = -45.0f + 175.0f * rawTemperature / 65535.0f;
  float humidity = -6.0f + 125.0f * rawHumidity / 65535.0f;
  if (humidity < 0.0f) humidity = 0.0f;
  if (humidity > 100.0f) humidity = 100.0f;
  temperatureTenths = static_cast<int32_t>(lroundf(temperature * 10.0f));
  humidityTenths = static_cast<int32_t>(lroundf(humidity * 10.0f));
  return true;
}

// ---------------------------------------------------------------------------
// LTR390 Functions
// ---------------------------------------------------------------------------
bool ltr390WriteRegister(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(LTR390_ADDRESS);
  Wire.write(reg);
  Wire.write(value);
  return Wire.endTransmission() == 0;
}

bool ltr390ReadRegister(uint8_t reg, uint8_t& value) {
  Wire.beginTransmission(LTR390_ADDRESS);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(LTR390_ADDRESS, static_cast<uint8_t>(1)) != 1) return false;
  value = Wire.read();
  return true;
}

bool ltr390Read24(uint8_t startReg, int32_t& value) {
  Wire.beginTransmission(LTR390_ADDRESS);
  Wire.write(startReg);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom(LTR390_ADDRESS, static_cast<uint8_t>(3)) != 3) return false;
  const uint32_t low = Wire.read();
  const uint32_t middle = Wire.read();
  const uint32_t high = Wire.read();
  value = static_cast<int32_t>(low | (middle << 8) | (high << 16));
  return true;
}

bool ltr390SetMode(bool uvMode) {
  const uint8_t control = LTR390_SENSOR_ENABLE | (uvMode ? LTR390_UVS_MODE : 0);
  if (!ltr390WriteRegister(LTR390_MAIN_CTRL, control)) return false;
  ltr390UvMode = uvMode;
  return true;
}

bool initLtr390() {
  uint8_t partId = 0;
  if (!ltr390ReadRegister(LTR390_PART_ID, partId) || (partId >> 4) != 0x0B) {
    Serial.println(F("[LTR390][INFO] Kein LTR390 mit gueltiger PART_ID auf 0x53 erkannt."));
    return false;
  }

  // 18-bit resolution with 100 ms integration, 3x gain (datasheet defaults).
  if (!ltr390WriteRegister(LTR390_MEAS_RATE, 0x22) ||
      !ltr390WriteRegister(LTR390_GAIN, 0x01) || !ltr390SetMode(false)) {
    Serial.println(F("[LTR390][FEHLER] Konfiguration des Sensors fehlgeschlagen."));
    return false;
  }

  Serial.printf("[LTR390] Bereit auf I2C 0x53 (PART_ID=0x%02X), 18 Bit, 100 ms, Gain 3x.\n", partId);
  return true;
}

void sampleLtr390() {
  if (!ltr390Ready) return;
  uint8_t status = 0;
  if (!ltr390ReadRegister(LTR390_MAIN_STATUS, status)) {
    Serial.println(F("[LTR390][FEHLER] Statusregister konnte nicht gelesen werden."));
    return;
  }
  if ((status & LTR390_DATA_READY) != 0) {
    int32_t raw = 0;
    const uint8_t dataReg = ltr390UvMode ? LTR390_UVS_DATA : LTR390_ALS_DATA;
    if (!ltr390Read24(dataReg, raw)) {
      Serial.println(F("[LTR390][FEHLER] Messdaten konnten nicht gelesen werden."));
    } else if (ltr390UvMode) {
      latestLtr390UvRaw = raw;
      haveLtr390UvSample = true;
      const float uvIndex = raw / LTR390_COUNTS_PER_UVI;
      Serial.printf("[LTR390] UV raw=%ld, UVI=%.2f\n", static_cast<long>(raw), uvIndex);
    } else {
      latestLtr390AlsRaw = raw;
      haveLtr390AlsSample = true;
      const float lux = (0.6f * raw) / (LTR390_GAIN_FACTOR * LTR390_INTEGRATION_FACTOR);
      Serial.printf("[LTR390] ALS raw=%ld, Licht=%.1f lux\n", static_cast<long>(raw), lux);
    }
  }

  // ALS and UVS share one ADC. Alternate modes so both channels are sampled.
  if (!ltr390SetMode(!ltr390UvMode)) {
    Serial.println(F("[LTR390][FEHLER] Umschalten zwischen ALS und UVS fehlgeschlagen."));
  }
}

// ---------------------------------------------------------------------------
// SGP41 Functions
// ---------------------------------------------------------------------------
void encodeSgp41Compensation(int32_t humidityTenths, int32_t temperatureTenths,
    uint8_t humidityBytes[2], uint8_t temperatureBytes[2]) {
  float humidity = humidityTenths / 10.0f;
  float temperature = temperatureTenths / 10.0f;
  if (humidity < 0.0f) humidity = 0.0f;
  if (humidity > 100.0f) humidity = 100.0f;
  if (temperature < -45.0f) temperature = -45.0f;
  if (temperature > 130.0f) temperature = 130.0f;
  const uint16_t humidityTicks = static_cast<uint16_t>(lroundf(humidity * 65535.0f / 100.0f));
  const uint16_t temperatureTicks = static_cast<uint16_t>(lroundf((temperature + 45.0f) * 65535.0f / 175.0f));
  humidityBytes[0] = static_cast<uint8_t>(humidityTicks >> 8);
  humidityBytes[1] = static_cast<uint8_t>(humidityTicks);
  temperatureBytes[0] = static_cast<uint8_t>(temperatureTicks >> 8);
  temperatureBytes[1] = static_cast<uint8_t>(temperatureTicks);
}

bool sgp41StartConditioning() {
  uint8_t humidityBytes[2];
  uint8_t temperatureBytes[2];
  encodeSgp41Compensation(haveSht41Sample ? latestHumidityTenths : (haveScd41Sample ? latestScd41HumidityHundredths / 10 : 500),
      haveSht41Sample ? latestTemperatureTenths : (haveScd41Sample ? latestScd41TemperatureHundredths / 10 : 250),
      humidityBytes, temperatureBytes);
  Wire.beginTransmission(SGP41_ADDRESS);
  const uint8_t command[] = {0x26, 0x12, humidityBytes[0], humidityBytes[1],
      sensirionCrc8(humidityBytes, sizeof(humidityBytes)), temperatureBytes[0],
      temperatureBytes[1], sensirionCrc8(temperatureBytes, sizeof(temperatureBytes))};
  Wire.write(command, sizeof(command));
  if (Wire.endTransmission() != 0) return false;
  delay(50);
  uint8_t response[3];
  if (Wire.requestFrom(SGP41_ADDRESS, static_cast<uint8_t>(sizeof(response))) != sizeof(response)) return false;
  for (uint8_t& byte : response) byte = Wire.read();
  return sensirionCrc8(response, 2) == response[2];
}

bool sgp41MeasureRaw(int32_t humidityTenths, int32_t temperatureTenths,
    int32_t& vocRaw, int32_t& noxRaw) {
  uint8_t humidityBytes[2];
  uint8_t temperatureBytes[2];
  encodeSgp41Compensation(humidityTenths, temperatureTenths,
      humidityBytes, temperatureBytes);

  Wire.beginTransmission(SGP41_ADDRESS);
  Wire.write(0x26);
  Wire.write(0x19);
  Wire.write(humidityBytes, sizeof(humidityBytes));
  Wire.write(sensirionCrc8(humidityBytes, sizeof(humidityBytes)));
  Wire.write(temperatureBytes, sizeof(temperatureBytes));
  Wire.write(sensirionCrc8(temperatureBytes, sizeof(temperatureBytes)));
  if (Wire.endTransmission() != 0) return false;
  delay(50);
  uint8_t response[6];
  if (Wire.requestFrom(SGP41_ADDRESS, static_cast<uint8_t>(sizeof(response))) != sizeof(response)) return false;
  for (uint8_t& byte : response) byte = Wire.read();
  if (sensirionCrc8(response, 2) != response[2] || sensirionCrc8(response + 3, 2) != response[5]) return false;
  vocRaw = (static_cast<uint16_t>(response[0]) << 8) | response[1];
  noxRaw = (static_cast<uint16_t>(response[3]) << 8) | response[4];
  return true;
}

// ---------------------------------------------------------------------------
// SCD41 Functions
// ---------------------------------------------------------------------------
bool scd41SendCommand(uint16_t command) {
  Wire.beginTransmission(SCD41_ADDRESS);
  Wire.write(static_cast<uint8_t>(command >> 8));
  Wire.write(static_cast<uint8_t>(command & 0xFF));
  return Wire.endTransmission() == 0;
}

bool scd41StopPeriodicMeasurement() {
  scd41SendCommand(0x3F86);
  delay(500); // Sensirion specifies 500 ms execution time for stop_periodic_measurement
  return true;
}

bool scd41StartPeriodicMeasurement() {
  if (!scd41SendCommand(0x21B1)) return false;
  delay(20);
  return true;
}

bool scd41ReadSerialNumber(uint64_t& serialNumber) {
  if (!scd41SendCommand(0x3682)) return false;
  delay(2);
  uint8_t buffer[9];
  if (Wire.requestFrom(SCD41_ADDRESS, static_cast<uint8_t>(sizeof(buffer))) != sizeof(buffer)) return false;
  for (uint8_t& byte : buffer) byte = Wire.read();
  if (sensirionCrc8(buffer, 2) != buffer[2] ||
      sensirionCrc8(buffer + 3, 2) != buffer[5] ||
      sensirionCrc8(buffer + 6, 2) != buffer[8]) {
    return false;
  }
  const uint16_t word0 = (static_cast<uint16_t>(buffer[0]) << 8) | buffer[1];
  const uint16_t word1 = (static_cast<uint16_t>(buffer[3]) << 8) | buffer[4];
  const uint16_t word2 = (static_cast<uint16_t>(buffer[6]) << 8) | buffer[7];
  serialNumber = (static_cast<uint64_t>(word0) << 32) |
                 (static_cast<uint64_t>(word1) << 16) |
                 static_cast<uint64_t>(word2);
  return true;
}

bool scd41GetDataReady(bool& isReady) {
  isReady = false;
  if (!scd41SendCommand(0xE4B8)) return false;
  delay(2);
  uint8_t buffer[3];
  if (Wire.requestFrom(SCD41_ADDRESS, static_cast<uint8_t>(sizeof(buffer))) != sizeof(buffer)) return false;
  for (uint8_t& byte : buffer) byte = Wire.read();
  if (sensirionCrc8(buffer, 2) != buffer[2]) return false;
  const uint16_t status = (static_cast<uint16_t>(buffer[0]) << 8) | buffer[1];
  // If least significant 11 bits are non-zero, data is ready
  isReady = (status & 0x07FF) != 0;
  return true;
}

bool scd41ReadMeasurement(int32_t& co2Ppm, int32_t& tempHundredths, int32_t& humHundredths) {
  if (!scd41SendCommand(0xEC05)) return false;
  delay(2);
  uint8_t buffer[9];
  if (Wire.requestFrom(SCD41_ADDRESS, static_cast<uint8_t>(sizeof(buffer))) != sizeof(buffer)) return false;
  for (uint8_t& byte : buffer) byte = Wire.read();
  if (sensirionCrc8(buffer, 2) != buffer[2] ||
      sensirionCrc8(buffer + 3, 2) != buffer[5] ||
      sensirionCrc8(buffer + 6, 2) != buffer[8]) {
    return false;
  }

  const uint16_t rawCo2 = (static_cast<uint16_t>(buffer[0]) << 8) | buffer[1];
  const uint16_t rawTemp = (static_cast<uint16_t>(buffer[3]) << 8) | buffer[4];
  const uint16_t rawHum = (static_cast<uint16_t>(buffer[6]) << 8) | buffer[7];

  co2Ppm = static_cast<int32_t>(rawCo2);
  const float tempC = -45.0f + 175.0f * static_cast<float>(rawTemp) / 65535.0f;
  float humPercent = 100.0f * static_cast<float>(rawHum) / 65535.0f;
  if (humPercent < 0.0f) humPercent = 0.0f;
  if (humPercent > 100.0f) humPercent = 100.0f;

  tempHundredths = static_cast<int32_t>(lroundf(tempC * 100.0f));
  humHundredths = static_cast<int32_t>(lroundf(humPercent * 100.0f));
  return true;
}

bool initScd41() {
  Serial.println(F("[SCD41] Initialisiere Sensor auf I2C 0x62..."));
  scd41StopPeriodicMeasurement();

  uint64_t serial = 0;
  bool ok = false;
  for (uint8_t attempt = 0; attempt < 3; ++attempt) {
    if (scd41ReadSerialNumber(serial)) {
      ok = true;
      break;
    }
    delay(50);
  }

  if (!ok) {
    Serial.println(F("[SCD41][INFO] Kein SCD41 auf I2C-Adresse 0x62 erkannt."));
    return false;
  }

  Serial.printf("[SCD41] Bereit! Seriennummer: 0x%04X%08lX\n",
      static_cast<uint16_t>(serial >> 32),
      static_cast<unsigned long>(serial & 0xFFFFFFFFULL));

  if (!scd41StartPeriodicMeasurement()) {
    Serial.println(F("[SCD41][FEHLER] Periodische Messung konnte nicht gestartet werden."));
    return false;
  }

  Serial.println(F("[SCD41] Periodische Messung (5 s Intervall) gestartet."));
  return true;
}

// ---------------------------------------------------------------------------
// Sensor Sampling
// ---------------------------------------------------------------------------
void sampleSensors() {
  // 1. SHT41
  int32_t shtTemp = 0;
  int32_t shtHum = 0;
  if (readSht41(shtTemp, shtHum)) {
    latestTemperatureTenths = shtTemp;
    latestHumidityTenths = shtHum;
    haveSht41Sample = true;
    sht41ErrorLogged = false;
    defaultCompensationLogged = false;
  } else if (!sht41ErrorLogged) {
    Serial.println(F("[SHT41][FEHLER] Messung fehlgeschlagen."));
    sht41ErrorLogged = true;
  }

  // 1b. LTR390 ALS and UV channels share one ADC and are sampled alternately.
  sampleLtr390();

  // 2. SCD41
  if (scd41Ready) {
    bool dataReady = false;
    if (scd41GetDataReady(dataReady) && dataReady) {
      int32_t co2 = 0;
      int32_t scdTemp = 0;
      int32_t scdHum = 0;
      if (scd41ReadMeasurement(co2, scdTemp, scdHum)) {
        latestCo2Ppm = co2;
        latestScd41TemperatureHundredths = scdTemp;
        latestScd41HumidityHundredths = scdHum;
        haveScd41Sample = true;
        Serial.printf("[SCD41] CO2=%ld ppm, Temp=%.2f C, Feuchte=%.2f %%\n",
            static_cast<long>(latestCo2Ppm),
            latestScd41TemperatureHundredths / 100.0f,
            latestScd41HumidityHundredths / 100.0f);
      } else {
        Serial.println(F("[SCD41][FEHLER] Messwert konnte nicht ausgelesen werden."));
      }
    }
  }

  // 3. SGP41
  if (!sgp41Ready) return;
  if (sgp41Conditioning) {
    if (millis() - sgp41ConditioningStartMs >= SGP41_CONDITIONING_MS) {
      sgp41Conditioning = false;
      Serial.println(F("[SGP41] Conditioning abgeschlossen; starte Rohsignal- und Index-Messungen."));
      return;
    }
    if (!sgp41StartConditioning()) {
      Serial.println(F("[SGP41][FEHLER] Conditioning fehlgeschlagen."));
      sgp41Ready = false;
      sgp41Conditioning = false;
      return;
    }
    return;
  }

  int32_t compHum = 500;
  int32_t compTemp = 250;
  if (haveSht41Sample) {
    compHum = latestHumidityTenths;
    compTemp = latestTemperatureTenths;
  } else if (haveScd41Sample) {
    compHum = latestScd41HumidityHundredths / 10;
    compTemp = latestScd41TemperatureHundredths / 10;
  } else if (!defaultCompensationLogged) {
    Serial.println(F("[SGP41][INFO] Feuchtekompensation nutzt Standardwerte 50 % / 25 C."));
    defaultCompensationLogged = true;
  }

  int32_t vocRaw = 0;
  int32_t noxRaw = 0;
  if (!sgp41MeasureRaw(compHum, compTemp, vocRaw, noxRaw)) {
    Serial.println(F("[SGP41][FEHLER] Rohsignal-Messung fehlgeschlagen."));
    return;
  }
  GasIndexAlgorithm_process(&sgp41VocAlgorithm, vocRaw, &latestSgp41VocIndex);
  GasIndexAlgorithm_process(&sgp41NoxAlgorithm, noxRaw, &latestSgp41NoxIndex);
  haveSgp41Sample = true;
  Serial.printf("[SGP41] VOC raw=%ld index=%ld, NOx raw=%ld index=%ld\n",
      static_cast<long>(vocRaw), static_cast<long>(latestSgp41VocIndex),
      static_cast<long>(noxRaw), static_cast<long>(latestSgp41NoxIndex));
}

// ---------------------------------------------------------------------------
// LoRaWAN and Protocol Helpers
// ---------------------------------------------------------------------------
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
  // RAK3212 routes the SX1262 RF switch supply to internal GPIO4 (ANT_SW).
  pinMode(LORA_ANT_SWITCH_POWER, OUTPUT);
  digitalWrite(LORA_ANT_SWITCH_POWER, HIGH);
  Serial.println(F("[RADIO] ANT_SW (GPIO4) eingeschaltet."));
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
    Serial.println(F("[LORAWAN] OTAA aus: kein gueltiges geraetespezifisches Schluesselprofil eingebunden."));
    Serial.println(F("[LORAWAN] Build mit build.sh <version> <TTN-device-id>; OTAA 1.1 benoetigt NwkKey und AppKey als 32-stellige Hex-Strings."));
    return false;
  }

  const int16_t beginState = node->beginOTAA(joinEUI, devEUI, nwkKey, appKey);
  if (beginState != RADIOLIB_ERR_NONE) {
    Serial.printf("[LORAWAN][FEHLER] OTAA-Konfiguration fehlgeschlagen: %d\n", beginState);
    return false;
  }
  restoreLoRaWANSession();

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
  if (state != RADIOLIB_ERR_NONE &&
      state != RADIOLIB_LORAWAN_NEW_SESSION &&
      state != RADIOLIB_LORAWAN_SESSION_RESTORED && state <= 0) {
    Serial.printf("[LORAWAN][FEHLER] Join fehlgeschlagen: %d\n", state);
    return false;
  }

  Serial.println(state == RADIOLIB_LORAWAN_SESSION_RESTORED
      ? F("[LORAWAN] Gespeicherte TTN-Sitzung wieder aktiv.")
      : F("[LORAWAN] Join erfolgreich."));
  return true;
}

void scheduleJoinRetry() {
  uint32_t delayMs = JOIN_RETRY_BASE_MS;
  const uint8_t shifts = joinRetryCount < 5 ? joinRetryCount : 5;
  delayMs <<= shifts;
  if (delayMs > JOIN_RETRY_MAX_MS) delayMs = JOIN_RETRY_MAX_MS;
  if (joinRetryCount < 255) ++joinRetryCount;
  nextJoinAttemptMs = millis() + delayMs;
  Serial.printf("[LORAWAN] Naechster Join-Versuch in %lu s.\n",
      static_cast<unsigned long>(delayMs / 1000UL));
}

void sendTelemetryUplink() {
  if (!haveSht41Sample && !haveSgp41Sample && !haveScd41Sample &&
      !haveLtr390UvSample && !haveLtr390AlsSample) {
    Serial.println(F("[SENSOR][FEHLER] Noch kein gültiger Messwert; Uplink wird ausgelassen."));
    return;
  }
  EncodedMeasurement measurements[MAX_MEASUREMENTS];
  size_t measurementCount = 0;

  // Temperature & Humidity: prefer SHT41, fallback to SCD41
  if (haveSht41Sample) {
    measurements[measurementCount++] = {METRIC_TEMPERATURE, latestTemperatureTenths};
    measurements[measurementCount++] = {METRIC_HUMIDITY, latestHumidityTenths};
  } else if (haveScd41Sample) {
    measurements[measurementCount++] = {METRIC_TEMPERATURE, latestScd41TemperatureHundredths / 10};
    measurements[measurementCount++] = {METRIC_HUMIDITY, latestScd41HumidityHundredths / 10};
  }

  // SCD41 metrics: CO2, detailed temp and humidity
  if (haveScd41Sample) {
    measurements[measurementCount++] = {METRIC_CO2, latestCo2Ppm};
    measurements[measurementCount++] = {METRIC_SCD41_TEMPERATURE, latestScd41TemperatureHundredths};
    measurements[measurementCount++] = {METRIC_SCD41_HUMIDITY, latestScd41HumidityHundredths};
  }

  // SGP41 VOC & NOx indices
  if (haveSgp41Sample) {
    measurements[measurementCount++] = {METRIC_SGP41_VOC_INDEX, latestSgp41VocIndex};
    measurements[measurementCount++] = {METRIC_SGP41_NOX_INDEX, latestSgp41NoxIndex};
  }
  if (haveLtr390UvSample) {
    const int32_t uvIndexHundredths = static_cast<int32_t>(lroundf(
        latestLtr390UvRaw * 100.0f / LTR390_COUNTS_PER_UVI));
    measurements[measurementCount++] = {METRIC_UV_INDEX, uvIndexHundredths};
    measurements[measurementCount++] = {METRIC_LTR390_UV_RAW, latestLtr390UvRaw};
  }
  if (haveLtr390AlsSample) {
    const float lux = (0.6f * latestLtr390AlsRaw) /
        (LTR390_GAIN_FACTOR * LTR390_INTEGRATION_FACTOR);
    measurements[measurementCount++] = {METRIC_AMBIENT_LIGHT,
        static_cast<int32_t>(lroundf(lux * 10.0f))};
    measurements[measurementCount++] = {METRIC_LTR390_ALS_RAW, latestLtr390AlsRaw};
  }
  static_assert(sizeof(measurements) / sizeof(measurements[0]) <= MAX_MEASUREMENTS,
      "Too many measurements for one LoRaWAN uplink");

  uint8_t payload[MAX_UPLINK_BYTES];
  size_t payloadLength = PAYLOAD_HEADER_BYTES;
  payload[0] = PAYLOAD_VERSION;
  payload[1] = FIRMWARE_VERSION;
  for (size_t i = 0; i < measurementCount; ++i) {
    const EncodedMeasurement& measurement = measurements[i];
    payload[payloadLength++] = measurement.code;
    const uint32_t value = static_cast<uint32_t>(measurement.value);
    payload[payloadLength++] = static_cast<uint8_t>(value >> 24);
    payload[payloadLength++] = static_cast<uint8_t>(value >> 16);
    payload[payloadLength++] = static_cast<uint8_t>(value >> 8);
    payload[payloadLength++] = static_cast<uint8_t>(value);
  }

  Serial.printf("[UPLINK] FPort=%u, payload=%u, firmware=v%u, measurements=%u, payload=%u bytes\n",
      UPLINK_FPORT, payload[0], FIRMWARE_VERSION,
      static_cast<unsigned>(measurementCount), static_cast<unsigned>(payloadLength));
  if (haveSht41Sample) {
    Serial.printf("[SHT41] Temperatur=%.1f C, Feuchte=%.1f %%\n",
        latestTemperatureTenths / 10.0f, latestHumidityTenths / 10.0f);
  }
  if (haveScd41Sample) {
    Serial.printf("[SCD41] CO2=%ld ppm, SCD41-Temp=%.2f C, SCD41-Feuchte=%.2f %%\n",
        static_cast<long>(latestCo2Ppm),
        latestScd41TemperatureHundredths / 100.0f,
        latestScd41HumidityHundredths / 100.0f);
  }
  if (haveSgp41Sample) {
    Serial.printf("[SGP41] VOC-Luftqualitätsindex=%ld, NOx-Luftqualitätsindex=%ld\n",
        static_cast<long>(latestSgp41VocIndex), static_cast<long>(latestSgp41NoxIndex));
  }
  if (haveLtr390UvSample) {
    Serial.printf("[LTR390] UV raw=%ld, UVI=%.2f\n",
        static_cast<long>(latestLtr390UvRaw),
        latestLtr390UvRaw / LTR390_COUNTS_PER_UVI);
  }
  if (haveLtr390AlsSample) {
    const float lux = (0.6f * latestLtr390AlsRaw) /
        (LTR390_GAIN_FACTOR * LTR390_INTEGRATION_FACTOR);
    Serial.printf("[LTR390] ALS raw=%ld, Licht=%.1f lux\n",
        static_cast<long>(latestLtr390AlsRaw), lux);
  }
  for (size_t i = 0; i < measurementCount; ++i) {
    const EncodedMeasurement& measurement = measurements[i];
    Serial.printf("[UPLINK] metric=%u, raw=%ld\n", measurement.code,
        static_cast<long>(measurement.value));
  }

  uint8_t downlink[16];
  size_t downlinkLength = sizeof(downlink);
  const int16_t state = node->sendReceive(payload, payloadLength, UPLINK_FPORT,
      downlink, &downlinkLength);
  persistLoRaWANSecurityState();
  if (state < RADIOLIB_ERR_NONE) {
    Serial.printf("[UPLINK][FEHLER] Senden/Empfang fehlgeschlagen: %d\n", state);
    if (state == RADIOLIB_ERR_NETWORK_NOT_JOINED) {
      Serial.println(F("[LORAWAN] Stack meldet keine aktive Sitzung; Sitzung wird verworfen, Nonces bleiben erhalten."));
      node->clearSession();
      persistLoRaWANSecurityState();
      joined = false;
      scheduleJoinRetry();
    }
  } else {
    Serial.println(F("[UPLINK] Nachricht an LoRaWAN-Stack übergeben."));
    if (downlinkLength > 0) {
      Serial.printf("[DOWNLINK] %u Byte empfangen.\n", static_cast<unsigned>(downlinkLength));
    }
  }
}

void scanI2CBus() {
  Serial.println(F("[I2C] Scanne I2C-Bus (SDA=GPIO14, SCL=GPIO13)..."));
  uint8_t found = 0;
  for (uint8_t address = 1; address < 127; ++address) {
    Wire.beginTransmission(address);
    if (Wire.endTransmission() == 0) {
      Serial.printf("[I2C] Geraet gefunden auf 0x%02X", address);
      if (address == SHT41_ADDRESS) Serial.print(F(" (SHT41)"));
      else if (address == SGP41_ADDRESS) Serial.print(F(" (SGP41)"));
      else if (address == SCD41_ADDRESS) Serial.print(F(" (SCD41)"));
      else if (address == LTR390_ADDRESS) Serial.print(F(" (LTR390)"));
      Serial.println();
      found++;
    }
  }
  if (found == 0) {
    Serial.println(F("[I2C][WARNUNG] Keine I2C-Geraete gefunden!"));
  } else {
    Serial.printf("[I2C] Scan beendet: %u Geraet(e) gefunden.\n", found);
  }
}

void setup() {
  Serial.begin(SERIAL_BAUD);
  delay(1200);
  Serial.println();
  Serial.println(F("=== KAMUE RAK3112 / RAK3212 Firmware v8 ==="));
  Serial.printf("[SYSTEM] ESP32-S3, CPU %u MHz, freier Heap %u Byte\n",
      ESP.getCpuFreqMHz(), ESP.getFreeHeap());
  Serial.printf("[SYSTEM] Flash %u MB, PSRAM %u Byte\n",
      ESP.getFlashChipSize() / (1024U * 1024U), ESP.getPsramSize());

  GasIndexAlgorithm_init(&sgp41VocAlgorithm, GasIndexAlgorithm_ALGORITHM_TYPE_VOC);
  GasIndexAlgorithm_init(&sgp41NoxAlgorithm, GasIndexAlgorithm_ALGORITHM_TYPE_NOX);
  Serial.println(F("[SGP41] Sensirion Gas Index Algorithm v3.2.0 initialisiert (VOC/NOx, 1 s)."));

  Wire.begin(I2C_SDA_PIN, I2C_SCL_PIN);
  Wire.setClock(100000);
  scanI2CBus();

  nextSampleMs = millis() + SGP41_SAMPLE_INTERVAL_MS;

  // Initialize SHT41
  int32_t startupTemperature = 0;
  int32_t startupHumidity = 0;
  haveSht41Sample = readSht41(startupTemperature, startupHumidity);
  if (haveSht41Sample) {
    latestTemperatureTenths = startupTemperature;
    latestHumidityTenths = startupHumidity;
    Serial.printf("[SHT41] bereit auf SDA=%d/SCL=%d: %.1f C, %.1f %%\n",
        I2C_SDA_PIN, I2C_SCL_PIN, startupTemperature / 10.0f, startupHumidity / 10.0f);
  } else {
    Serial.printf("[SHT41][FEHLER] Sensor auf SDA=%d/SCL=%d nicht erreichbar oder CRC ungueltig.\n",
        I2C_SDA_PIN, I2C_SCL_PIN);
    sht41ErrorLogged = true;
  }

  // Initialize SCD41
  scd41Ready = initScd41();

  // Initialize SGP41
  sgp41Ready = sgp41StartConditioning();
  if (sgp41Ready) {
    sgp41Conditioning = true;
    sgp41ConditioningStartMs = millis();
    Serial.println(F("[SGP41] erkannt; 10-Sekunden-Conditioning gestartet."));
  } else {
    Serial.println(F("[SGP41][INFO] Kein SGP41 auf I2C-Adresse 0x59 erkannt."));
  }

  // Initialize optional LTR390 UV / ambient-light sensor.
  ltr390Ready = initLtr390();

  radioReady = initRadio();
  if (!radioReady) return;

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
    joinRetryCount = 0;
    lastUplinkMs = millis();
    if (sgp41Ready || scd41Ready || ltr390Ready) {
      initialUplinkPending = true;
      Serial.println(F("[UPLINK] Erster Uplink wartet auf Sensor-Anlaufwerte."));
    } else {
      sendTelemetryUplink();
    }
  } else {
    scheduleJoinRetry();
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

  if (static_cast<int32_t>(millis() - nextSampleMs) >= 0) {
    nextSampleMs = millis() + SGP41_SAMPLE_INTERVAL_MS;
    sampleSensors();
  }

  // Initial uplink condition
  if (joined && initialUplinkPending) {
    bool sgpReadyCondition = !sgp41Ready || (haveSgp41Sample && latestSgp41VocIndex > 0 && latestSgp41NoxIndex > 0);
    bool scdReadyCondition = !scd41Ready || haveScd41Sample;
    bool ltrReadyCondition = !ltr390Ready || (haveLtr390UvSample && haveLtr390AlsSample);
    if (sgpReadyCondition && scdReadyCondition && ltrReadyCondition) {
      initialUplinkPending = false;
      sendTelemetryUplink();
      lastUplinkMs = millis();
    }
  }

  // Regular periodic uplink
  if (joined && !initialUplinkPending && millis() - lastUplinkMs >= UPLINK_INTERVAL_MS) {
    lastUplinkMs = millis();
    sendTelemetryUplink();
  }

  // Network reconnect retry
  if (radioReady && !joined && credentialsConfigured() &&
      static_cast<int32_t>(millis() - nextJoinAttemptMs) >= 0) {
    Serial.println(F("[LORAWAN] Starte automatischen Wiederverbindungsversuch."));
    joined = joinNetwork();
    if (joined) {
      joinRetryCount = 0;
      lastUplinkMs = millis();
      bool sgpReadyCondition = !sgp41Ready || (haveSgp41Sample && latestSgp41VocIndex > 0 && latestSgp41NoxIndex > 0);
      bool scdReadyCondition = !scd41Ready || haveScd41Sample;
      bool ltrReadyCondition = !ltr390Ready || (haveLtr390UvSample && haveLtr390AlsSample);
      if (!sgpReadyCondition || !scdReadyCondition || !ltrReadyCondition) {
        initialUplinkPending = true;
        Serial.println(F("[UPLINK] Erster Uplink wartet auf Sensor-Anlaufwerte."));
      } else {
        initialUplinkPending = false;
        sendTelemetryUplink();
      }
    } else {
      scheduleJoinRetry();
    }
  }
  delay(20);
}
