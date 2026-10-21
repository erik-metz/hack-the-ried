/*
 * RAK3112 / RAK3212 with SHT41, SGP41, SCD41, LTR390, BME688 and ICS-43434 I2S microphone.
 *
 * Firmware version 12 adds local ESC-50 audio classification to v11.
 * The build helper injects a per-device secrets.h outside the repository.
 */

#include <Arduino.h>
#include <Preferences.h>
#include <RadioLib.h>
#include <Wire.h>
#include <math.h>
#include <string.h>
#include <driver/i2s_std.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include <freertos/task.h>
#include <esp_timer.h>
#include <esp_heap_caps.h>
#include "tensorflow/lite/micro/micro_interpreter.h"
#include "tensorflow/lite/micro/micro_mutable_op_resolver.h"
#include "tensorflow/lite/schema/schema_generated.h"
#include "audio_classes.h"
#include "model_data.h"
#include "bme68x.h"
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
static constexpr uint8_t FIRMWARE_VERSION = 12;
static constexpr uint8_t PAYLOAD_VERSION = 6;
static constexpr uint8_t PAYLOAD_HEADER_BYTES = 5;
static constexpr size_t MAX_MEASUREMENTS = 41;
static constexpr size_t MAX_WINDOW_PAYLOAD_BYTES = 222;
static constexpr uint32_t WINDOW_SECONDS = 5U * 60U;

// Shared I2C configuration
static constexpr int8_t I2C_SDA_PIN = 14;
static constexpr int8_t I2C_SCL_PIN = 13;
static constexpr uint8_t SHT41_ADDRESS = 0x44;
static constexpr uint8_t SPS30_ADDRESS = 0x69;
static constexpr uint8_t SGP41_ADDRESS = 0x59;
static constexpr uint8_t SCD41_ADDRESS = 0x62;
static constexpr uint8_t LTR390_ADDRESS = 0x53;
static constexpr uint8_t BME68X_ADDRESS_LOW = BME68X_I2C_ADDR_LOW;
static constexpr uint8_t BME68X_ADDRESS_HIGH = BME68X_I2C_ADDR_HIGH;

// ICS-43434: SD -> GPIO10, SCK/BCLK -> GPIO11, WS -> GPIO12; L/R tied high selects right slot.
static constexpr int8_t I2S_MIC_SD_PIN = 10;
static constexpr int8_t I2S_MIC_SCK_PIN = 11;
static constexpr int8_t I2S_MIC_WS_PIN = 12;
static constexpr uint32_t I2S_MIC_SAMPLE_RATE = 16000;
static constexpr size_t I2S_MIC_FRAME_COUNT = 256;

// ACDNet20 ESC-50 fold-4 INT8 model: 20 kHz mono input, 30,225 samples.
// 16 kHz capture is linearly upsampled to the model rate without keeping audio
// outside two temporary PSRAM buffers.
static constexpr size_t AUDIO_MODEL_SAMPLE_COUNT = 30225;
static constexpr size_t AUDIO_CAPTURE_SAMPLE_COUNT = AUDIO_MODEL_SAMPLE_COUNT * 4 / 5;
static constexpr size_t AUDIO_MODEL_ARENA_BYTES = 768 * 1024;
static constexpr uint32_t AUDIO_MODEL_WINDOW_MS = AUDIO_CAPTURE_SAMPLE_COUNT * 1000UL / I2S_MIC_SAMPLE_RATE;
static constexpr uint32_t AUDIO_MODEL_REPORT_INTERVAL_MS = 1000;

static constexpr uint8_t SHT41_MEASURE_HIGH_PRECISION = 0xFD;
static constexpr uint32_t SGP41_SAMPLE_INTERVAL_MS = 1000;
static constexpr uint32_t SPS30_SAMPLE_INTERVAL_MS = 5000;
static constexpr uint8_t SPS30_SAMPLE_COUNT_CODE = 59;
static constexpr uint32_t SGP41_CONDITIONING_MS = 10000;
static constexpr uint32_t BME68X_SAMPLE_INTERVAL_MS = 10000;
static constexpr uint16_t BME68X_HEATER_TEMP_C = 320;
static constexpr uint16_t BME68X_HEATER_DURATION_MS = 150;
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
  METRIC_WINDOW_COUNT_SHT41 = 50,
  METRIC_WINDOW_COUNT_SCD41 = 51,
  METRIC_WINDOW_COUNT_SGP41 = 52,
  METRIC_WINDOW_COUNT_LTR390_UV = 53,
  METRIC_WINDOW_COUNT_LTR390_ALS = 54,
  METRIC_WINDOW_COUNT_BME68X = 55,
  METRIC_WINDOW_COUNT_BME68X_GAS = 56,
  METRIC_WINDOW_COUNT_MICROPHONE = 57,
};

enum WindowStatistic : uint8_t {
  WINDOW_MINIMUM = 0,
  WINDOW_MEAN = 1,
  WINDOW_MAXIMUM = 2,
  WINDOW_COUNT = 3,
};

struct MetricWindow {
  int32_t minimum = 0;
  int32_t maximum = 0;
  int64_t sum = 0;
  double soundEnergySum = 0.0;
  uint32_t count = 0;
  bool hasValue = false;
};

MetricWindow metricWindows[42];
uint64_t windowStartedUs = 0;
portMUX_TYPE metricWindowMux = portMUX_INITIALIZER_UNLOCKED;

void recordMetric(uint8_t code, int32_t value, double soundMeanSquare = -1.0) {
  if (code == 0 || code >= 42) return;
  portENTER_CRITICAL(&metricWindowMux);
  MetricWindow& window = metricWindows[code];
  if (!window.hasValue) {
    window.minimum = value;
    window.maximum = value;
    window.hasValue = true;
  } else {
    if (value < window.minimum) window.minimum = value;
    if (value > window.maximum) window.maximum = value;
  }
  window.sum += value;
  if (code == METRIC_SOUND_LEVEL && soundMeanSquare >= 0.0) {
    window.soundEnergySum += soundMeanSquare;
  }
  ++window.count;
  portEXIT_CRITICAL(&metricWindowMux);
}

void snapshotMetricWindows(MetricWindow* output) {
  portENTER_CRITICAL(&metricWindowMux);
  memcpy(output, metricWindows, sizeof(metricWindows));
  memset(metricWindows, 0, sizeof(metricWindows));
  portEXIT_CRITICAL(&metricWindowMux);
}

void restoreMetricWindows(const MetricWindow* snapshot) {
  portENTER_CRITICAL(&metricWindowMux);
  for (uint8_t code = 1; code < 42; ++code) {
    const MetricWindow& saved = snapshot[code];
    MetricWindow& current = metricWindows[code];
    if (!saved.hasValue) continue;
    if (!current.hasValue) {
      current.minimum = saved.minimum;
      current.maximum = saved.maximum;
      current.hasValue = true;
    } else {
      if (saved.minimum < current.minimum) current.minimum = saved.minimum;
      if (saved.maximum > current.maximum) current.maximum = saved.maximum;
    }
    current.sum += saved.sum;
    current.soundEnergySum += saved.soundEnergySum;
    current.count += saved.count;
  }
  portEXIT_CRITICAL(&metricWindowMux);
}

static constexpr float AUDIO_ML_SILENCE_THRESHOLD_DBFS = -36.0f;
static constexpr float AUDIO_ML_MIN_CONFIDENCE = 0.35f;
static constexpr uint8_t WINDOW_TAG_EVENT = 3;
static constexpr uint8_t SOUND_EVENT_CODE = 58;

static AudioEventStats audioEventCounts[AUDIO_MODEL_CLASS_COUNT] = {};
static portMUX_TYPE audioEventMux = portMUX_INITIALIZER_UNLOCKED;
static uint32_t audioMlSilentWindows = 0;

void restoreAudioEvents(const AudioEventStats* snapshot) {
  portENTER_CRITICAL(&audioEventMux);
  for (size_t c = 0; c < AUDIO_MODEL_CLASS_COUNT; ++c) {
    audioEventCounts[c].count += snapshot[c].count;
    if (snapshot[c].maxScore > audioEventCounts[c].maxScore) {
      audioEventCounts[c].maxScore = snapshot[c].maxScore;
    }
  }
  portEXIT_CRITICAL(&audioEventMux);
}

SX1262 radio = new Module(LORA_NSS, LORA_DIO1, LORA_RESET, LORA_BUSY);
LoRaWANBand_t singleChannelEU868;
LoRaWANNode* node = nullptr;
Preferences preferences;

bool radioReady = false;
bool joined = false;
bool sgp41Ready = false;
bool sps30Ready = false;
bool sgp41Conditioning = false;
bool scd41Ready = false;
bool ltr390Ready = false;
bool bme68xReady = false;
bool i2sMicReady = false;
bool haveSoundSample = false;
bool haveBme68xSample = false;
bool haveBme68xGasSample = false;
bool ltr390UvMode = false;
bool haveLtr390UvSample = false;
bool haveLtr390AlsSample = false;
bool initialUplinkPending = false;
bool haveSht41Sample = false;
bool haveSgp41Sample = false;
bool haveScd41Sample = false;
bool haveSps30Sample = false;
uint32_t nextSps30SampleMs = 0;
uint32_t lastSps30ErrorMs = 0;
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
float latestBme68xTemperatureC = 0.0f;
float latestBme68xHumidityPct = 0.0f;
float latestBme68xPressurePa = 0.0f;
uint32_t latestBme68xGasResistanceOhms = 0;
uint8_t bme68xAddress = BME68X_ADDRESS_LOW;
struct bme68x_dev bme68xDevice = {};
uint32_t nextBme68xSampleMs = 0;
int32_t latestSoundLevelTenthsDbfs = -960;
char latestI2sMicActiveSlot = 'R';
i2s_chan_handle_t i2sMicRxChannel = nullptr;
TaskHandle_t i2sMicTaskHandle = nullptr;
TaskHandle_t audioMlTaskHandle = nullptr;
QueueHandle_t audioMlWindowQueue = nullptr;
tflite::MicroMutableOpResolver<7> audioMlResolver;
tflite::MicroInterpreter* audioMlInterpreter = nullptr;
TfLiteTensor* audioMlInput = nullptr;
TfLiteTensor* audioMlOutput = nullptr;
uint8_t* audioMlArena = nullptr;
int8_t* audioMlInputBuffer = nullptr;
int16_t* audioCaptureBuffers[2] = {nullptr, nullptr};
volatile bool audioCaptureBufferBusy[2] = {false, false};
bool audioMlReady = false;
uint32_t audioMlDroppedSamples = 0;

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
// ICS-43434 I2S microphone
// ---------------------------------------------------------------------------
int acquireAudioCaptureBuffer() {
  for (int index = 0; index < 2; ++index) {
    if (!audioCaptureBufferBusy[index]) {
      audioCaptureBufferBusy[index] = true;
      return index;
    }
  }
  return -1;
}

void audioInferenceTask(void*) {
  uint8_t bufferIndex = 0;
  uint32_t inferenceCount = 0;
  uint64_t totalInferenceUs = 0;
  while (true) {
    if (xQueueReceive(audioMlWindowQueue, &bufferIndex, portMAX_DELAY) != pdTRUE) continue;

    // Fast RMS silence detection over the 1.51 s window before any resampling or inference
    double sumSquares = 0.0;
    for (size_t sampleIndex = 0; sampleIndex < AUDIO_CAPTURE_SAMPLE_COUNT; ++sampleIndex) {
      const double normalized = static_cast<double>(audioCaptureBuffers[bufferIndex][sampleIndex]) / 32768.0;
      sumSquares += normalized * normalized;
    }
    const double rms = sqrt(sumSquares / AUDIO_CAPTURE_SAMPLE_COUNT);
    const float rmsDbfs = rms > 0.0 ? static_cast<float>(20.0 * log10(rms)) : -96.0f;

    if (rmsDbfs < AUDIO_ML_SILENCE_THRESHOLD_DBFS) {
      audioCaptureBufferBusy[bufferIndex] = false;
      ++audioMlSilentWindows;
      if (audioMlSilentWindows % 20 == 1) {
        Serial.printf("[AUDIO-ML] Stille erkannt: RMS=%.1f dBFS < Schwelle %.1f dBFS (Inferenz uebersprungen, %lu Stille-Fenster)\n",
            rmsDbfs, AUDIO_ML_SILENCE_THRESHOLD_DBFS, static_cast<unsigned long>(audioMlSilentWindows));
      }
      continue;
    }

    const int64_t preprocessingStartedUs = esp_timer_get_time();
    for (size_t outputIndex = 0; outputIndex < AUDIO_MODEL_SAMPLE_COUNT; ++outputIndex) {
      const size_t sourcePositionTimesFour = outputIndex * 4;
      const size_t sourceIndex = sourcePositionTimesFour / 5;
      const size_t fractionalPart = sourcePositionTimesFour % 5;
      const size_t nextSourceIndex = sourceIndex + 1 < AUDIO_CAPTURE_SAMPLE_COUNT
          ? sourceIndex + 1 : sourceIndex;
      const int32_t sourceA = audioCaptureBuffers[bufferIndex][sourceIndex];
      const int32_t sourceB = audioCaptureBuffers[bufferIndex][nextSourceIndex];
      const int32_t interpolated = (sourceA * static_cast<int32_t>(5 - fractionalPart)
          + sourceB * static_cast<int32_t>(fractionalPart)) / 5;
      const float normalized = static_cast<float>(interpolated) / 32768.0f;
      const float quantized = normalized / audioMlInput->params.scale
          + audioMlInput->params.zero_point;
      int32_t value = static_cast<int32_t>(lroundf(quantized));
      if (value < -128) value = -128;
      if (value > 127) value = 127;
      audioMlInputBuffer[outputIndex] = static_cast<int8_t>(value);
    }
    const uint32_t preprocessingMs = static_cast<uint32_t>(
        (esp_timer_get_time() - preprocessingStartedUs) / 1000);

    const int64_t inferenceStartedUs = esp_timer_get_time();
    const TfLiteStatus inferenceStatus = audioMlInterpreter->Invoke();
    const uint32_t inferenceMs = static_cast<uint32_t>(
        (esp_timer_get_time() - inferenceStartedUs) / 1000);
    ++inferenceCount;
    totalInferenceUs += static_cast<uint64_t>(inferenceMs) * 1000;

    if (inferenceStatus == kTfLiteOk) {
      int topIndices[3] = {-1, -1, -1};
      int8_t topScores[3] = {-128, -128, -128};
      for (size_t classIndex = 0; classIndex < AUDIO_MODEL_CLASS_COUNT; ++classIndex) {
        const int8_t score = audioMlOutput->data.int8[classIndex];
        for (size_t rank = 0; rank < 3; ++rank) {
          if (topIndices[rank] >= 0 && score <= topScores[rank]) continue;
          for (size_t move = 2; move > rank; --move) {
            topScores[move] = topScores[move - 1];
            topIndices[move] = topIndices[move - 1];
          }
          topScores[rank] = score;
          topIndices[rank] = static_cast<int>(classIndex);
          break;
        }
      }
      const float scoreScale = audioMlOutput->params.scale;
      const int32_t zeroPoint = audioMlOutput->params.zero_point;
      const float score0 = (topScores[0] - zeroPoint) * scoreScale;
      const float score1 = (topScores[1] - zeroPoint) * scoreScale;
      const float score2 = (topScores[2] - zeroPoint) * scoreScale;
      const uint32_t freeInternal = heap_caps_get_free_size(MALLOC_CAP_INTERNAL | MALLOC_CAP_8BIT);
      const uint32_t freePsram = heap_caps_get_free_size(MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);

      if (topIndices[0] >= 0 && score0 >= AUDIO_ML_MIN_CONFIDENCE) {
        portENTER_CRITICAL(&audioEventMux);
        audioEventCounts[topIndices[0]].count++;
        if (score0 > audioEventCounts[topIndices[0]].maxScore) {
          audioEventCounts[topIndices[0]].maxScore = score0;
        }
        portEXIT_CRITICAL(&audioEventMux);
      }

      Serial.printf("[AUDIO-ML] #%lu %s=%.3f %s=%.3f %s=%.3f RMS=%.1f dBFS prep=%lu ms infer=%lu ms heap_int=%lu psram=%lu stack_hwm=%u dropped_samples=%lu\n",
          static_cast<unsigned long>(inferenceCount),
          AUDIO_MODEL_CLASSES[topIndices[0]], score0,
          AUDIO_MODEL_CLASSES[topIndices[1]], score1,
          AUDIO_MODEL_CLASSES[topIndices[2]], score2,
          rmsDbfs,
          static_cast<unsigned long>(preprocessingMs), static_cast<unsigned long>(inferenceMs),
          static_cast<unsigned long>(freeInternal), static_cast<unsigned long>(freePsram),
          static_cast<unsigned>(uxTaskGetStackHighWaterMark(nullptr) * sizeof(StackType_t)),
          static_cast<unsigned long>(audioMlDroppedSamples));
    } else {
      Serial.printf("[AUDIO-ML][FEHLER] Invoke fehlgeschlagen: %d\n", inferenceStatus);
    }

    audioCaptureBufferBusy[bufferIndex] = false;
    if (inferenceCount > 0 && inferenceCount % 20 == 0) {
      const uint64_t elapsedUs = static_cast<uint64_t>(millis()) * 1000;
      const float dutyPercent = elapsedUs > 0
          ? 100.0f * static_cast<float>(totalInferenceUs) / static_cast<float>(elapsedUs) : 0.0f;
      Serial.printf("[AUDIO-ML] Gesamt infer=%lu ms seit Start, CPU-Inferenzzeit/Bootzeit=%.1f%%\n",
          static_cast<unsigned long>(totalInferenceUs / 1000), dutyPercent);
    }
  }
}

bool initAudioMl() {
  const uint32_t freePsram = heap_caps_get_free_size(MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT);
  Serial.printf("[AUDIO-ML] ACDNet20 ESC-50 fold 4 INT8, Modell=%u Byte, freier PSRAM=%lu Byte\n",
      g_audio_model_len, static_cast<unsigned long>(freePsram));
  if (ESP.getPsramSize() < 1024U * 1024U || freePsram < AUDIO_MODEL_ARENA_BYTES + 256U * 1024U) {
    Serial.println(F("[AUDIO-ML][FEHLER] Fuer Modellarena und Audiopuffer ist nicht genug PSRAM verfuegbar."));
    return false;
  }

  if (audioMlResolver.AddConv2D() != kTfLiteOk
      || audioMlResolver.AddMaxPool2D() != kTfLiteOk
      || audioMlResolver.AddTranspose() != kTfLiteOk
      || audioMlResolver.AddAveragePool2D() != kTfLiteOk
      || audioMlResolver.AddReshape() != kTfLiteOk
      || audioMlResolver.AddFullyConnected() != kTfLiteOk
      || audioMlResolver.AddSoftmax() != kTfLiteOk) {
    Serial.println(F("[AUDIO-ML][FEHLER] TFLite-Operatoren konnten nicht registriert werden."));
    return false;
  }

  const tflite::Model* model = tflite::GetModel(g_audio_model);
  if (model->version() != TFLITE_SCHEMA_VERSION) {
    Serial.printf("[AUDIO-ML][FEHLER] Modell-Schema %d statt %d.\n", model->version(), TFLITE_SCHEMA_VERSION);
    return false;
  }

  audioMlArena = static_cast<uint8_t*>(heap_caps_malloc(
      AUDIO_MODEL_ARENA_BYTES, MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  audioCaptureBuffers[0] = static_cast<int16_t*>(heap_caps_malloc(
      AUDIO_CAPTURE_SAMPLE_COUNT * sizeof(int16_t), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  audioCaptureBuffers[1] = static_cast<int16_t*>(heap_caps_malloc(
      AUDIO_CAPTURE_SAMPLE_COUNT * sizeof(int16_t), MALLOC_CAP_SPIRAM | MALLOC_CAP_8BIT));
  if (audioMlArena == nullptr || audioCaptureBuffers[0] == nullptr || audioCaptureBuffers[1] == nullptr) {
    Serial.println(F("[AUDIO-ML][FEHLER] PSRAM-Puffer konnten nicht reserviert werden."));
    return false;
  }

  audioMlInterpreter = new tflite::MicroInterpreter(
      model, audioMlResolver, audioMlArena, AUDIO_MODEL_ARENA_BYTES);
  if (audioMlInterpreter == nullptr || audioMlInterpreter->AllocateTensors() != kTfLiteOk) {
    Serial.println(F("[AUDIO-ML][FEHLER] TFLite-Micro konnte Tensoren nicht anlegen."));
    return false;
  }
  audioMlInput = audioMlInterpreter->input(0);
  audioMlOutput = audioMlInterpreter->output(0);
  if (audioMlInput == nullptr || audioMlOutput == nullptr
      || audioMlInput->type != kTfLiteInt8 || audioMlOutput->type != kTfLiteInt8
      || audioMlInput->bytes < AUDIO_MODEL_SAMPLE_COUNT
      || audioMlOutput->bytes < AUDIO_MODEL_CLASS_COUNT) {
    Serial.println(F("[AUDIO-ML][FEHLER] Unerwartete Modell-Eingabe oder -Ausgabe."));
    return false;
  }
  audioMlInputBuffer = audioMlInput->data.int8;
  audioMlWindowQueue = xQueueCreate(2, sizeof(uint8_t));
  if (audioMlWindowQueue == nullptr) {
    Serial.println(F("[AUDIO-ML][FEHLER] Inferenz-Queue konnte nicht angelegt werden."));
    return false;
  }
  if (xTaskCreatePinnedToCore(audioInferenceTask, "rak-audio-ml", 16384,
          nullptr, 1, &audioMlTaskHandle, 0) != pdPASS) {
    Serial.println(F("[AUDIO-ML][FEHLER] Inferenz-Task konnte nicht gestartet werden."));
    return false;
  }
  audioMlReady = true;
  Serial.printf("[AUDIO-ML] bereit: 20 kHz, %u Samples/Fenster (%.2f s), %u Klassen, Arena genutzt=%u Byte, Input-Skala=%.6f\n",
      static_cast<unsigned>(AUDIO_MODEL_SAMPLE_COUNT), AUDIO_MODEL_WINDOW_MS / 1000.0f,
      static_cast<unsigned>(AUDIO_MODEL_CLASS_COUNT),
      static_cast<unsigned>(audioMlInterpreter->arena_used_bytes()), audioMlInput->params.scale);
  return true;
}

bool initI2sMicrophone() {
  i2s_chan_config_t channelConfig = I2S_CHANNEL_DEFAULT_CONFIG(I2S_NUM_0, I2S_ROLE_MASTER);
  esp_err_t result = i2s_new_channel(&channelConfig, nullptr, &i2sMicRxChannel);
  if (result != ESP_OK) {
    Serial.printf("[I2S-MIC][FEHLER] RX-Kanal konnte nicht angelegt werden: %d\n", result);
    return false;
  }

  i2s_std_config_t standardConfig = {
    .clk_cfg = I2S_STD_CLK_DEFAULT_CONFIG(I2S_MIC_SAMPLE_RATE),
    .slot_cfg = I2S_STD_PHILIPS_SLOT_DEFAULT_CONFIG(I2S_DATA_BIT_WIDTH_32BIT, I2S_SLOT_MODE_STEREO),
    .gpio_cfg = {
      .mclk = I2S_GPIO_UNUSED,
      .bclk = static_cast<gpio_num_t>(I2S_MIC_SCK_PIN),
      .ws = static_cast<gpio_num_t>(I2S_MIC_WS_PIN),
      .dout = I2S_GPIO_UNUSED,
      .din = static_cast<gpio_num_t>(I2S_MIC_SD_PIN),
      .invert_flags = { .mclk_inv = false, .bclk_inv = false, .ws_inv = false },
    },
  };
  result = i2s_channel_init_std_mode(i2sMicRxChannel, &standardConfig);
  if (result != ESP_OK) {
    Serial.printf("[I2S-MIC][FEHLER] I2S-Modus konnte nicht initialisiert werden: %d\n", result);
    i2s_del_channel(i2sMicRxChannel);
    i2sMicRxChannel = nullptr;
    return false;
  }
  result = i2s_channel_enable(i2sMicRxChannel);
  if (result != ESP_OK) {
    Serial.printf("[I2S-MIC][FEHLER] I2S-RX konnte nicht gestartet werden: %d\n", result);
    i2s_del_channel(i2sMicRxChannel);
    i2sMicRxChannel = nullptr;
    return false;
  }
  Serial.printf("[I2S-MIC] ICS-43434 bereit: SD=GPIO%d, SCK/BCLK=GPIO%d, WS=GPIO%d, %lu Hz, 32-Bit-Stereo-Slots; L/R=HIGH erwartet rechts, aktiver Slot wird erkannt.\n",
      I2S_MIC_SD_PIN, I2S_MIC_SCK_PIN, I2S_MIC_WS_PIN,
      static_cast<unsigned long>(I2S_MIC_SAMPLE_RATE));
  return true;
}

void microphoneTask(void*) {
  int32_t stereoSamples[I2S_MIC_FRAME_COUNT * 2];
  uint32_t lastLogMs = millis();
  uint32_t blocksSinceLog = 0;
  int activeMlBuffer = -1;
  size_t mlWindowSamples = 0;
  while (true) {
    if (!i2sMicReady || i2sMicRxChannel == nullptr) {
      vTaskDelay(pdMS_TO_TICKS(100));
      continue;
    }
    size_t bytesRead = 0;
    const esp_err_t result = i2s_channel_read(i2sMicRxChannel, stereoSamples,
        sizeof(stereoSamples), &bytesRead, pdMS_TO_TICKS(100));
    const size_t frameCount = bytesRead / (sizeof(int32_t) * 2);
    if (result != ESP_OK || frameCount == 0 || frameCount > I2S_MIC_FRAME_COUNT) {
      if (result != ESP_ERR_TIMEOUT) {
        Serial.printf("[I2S-MIC][WARNUNG] Audioblock unvollstaendig: %u Frames (Fehler %d).\n",
            static_cast<unsigned>(frameCount), result);
      }
      continue;
    }
  // L/R=HIGH selects the right slot. Compare both captured slots so an unexpected
  // board/core channel ordering is visible and the active microphone slot is used.
  double sumSquares[2] = {0.0, 0.0};
  for (size_t frame = 0; frame < frameCount; ++frame) {
    for (size_t slot = 0; slot < 2; ++slot) {
      const double normalized = static_cast<double>(stereoSamples[frame * 2 + slot]) / 2147483648.0;
      sumSquares[slot] += normalized * normalized;
    }
  }
  const size_t activeSlot = sumSquares[1] >= sumSquares[0] ? 1 : 0;
  latestI2sMicActiveSlot = activeSlot == 1 ? 'R' : 'L';
    if (audioMlReady) {
      for (size_t frame = 0; frame < frameCount; ++frame) {
        if (activeMlBuffer < 0) {
          activeMlBuffer = acquireAudioCaptureBuffer();
          mlWindowSamples = 0;
        }
        if (activeMlBuffer < 0) {
          ++audioMlDroppedSamples;
          continue;
        }
        audioCaptureBuffers[activeMlBuffer][mlWindowSamples++] =
            static_cast<int16_t>(stereoSamples[frame * 2 + activeSlot] >> 16);
        if (mlWindowSamples == AUDIO_CAPTURE_SAMPLE_COUNT) {
          const uint8_t completedBuffer = static_cast<uint8_t>(activeMlBuffer);
          if (xQueueSend(audioMlWindowQueue, &completedBuffer, 0) != pdTRUE) {
            audioCaptureBufferBusy[activeMlBuffer] = false;
            ++audioMlDroppedSamples;
          }
          activeMlBuffer = -1;
          mlWindowSamples = 0;
        }
      }
    }
    const double meanSquare = sumSquares[activeSlot] / frameCount;
    const double rms = sqrt(meanSquare);
    int32_t levelTenthsDbfs = rms > 0.0
      ? static_cast<int32_t>(lround(200.0 * log10(rms)))
      : -960;
    if (levelTenthsDbfs < -960) levelTenthsDbfs = -960;
    latestSoundLevelTenthsDbfs = levelTenthsDbfs;
    haveSoundSample = true;
    recordMetric(METRIC_SOUND_LEVEL, levelTenthsDbfs, meanSquare);
    ++blocksSinceLog;
    const uint32_t now = millis();
    if (now - lastLogMs >= 1000) {
      Serial.printf("[I2S-MIC] laufende Auswertung: RMS=%.1f dBFS, Slot %c, Bloecke/s=%lu\n",
          levelTenthsDbfs / 10.0f, latestI2sMicActiveSlot,
          static_cast<unsigned long>(blocksSinceLog));
      blocksSinceLog = 0;
      lastLogMs = now;
    }
  }
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
      recordMetric(METRIC_LTR390_UV_RAW, raw);
      recordMetric(METRIC_UV_INDEX, static_cast<int32_t>(lroundf(
          raw * 100.0f / LTR390_COUNTS_PER_UVI)));
      const float uvIndex = raw / LTR390_COUNTS_PER_UVI;
      Serial.printf("[LTR390] UV raw=%ld, UVI=%.2f\n", static_cast<long>(raw), uvIndex);
    } else {
      latestLtr390AlsRaw = raw;
      haveLtr390AlsSample = true;
      recordMetric(METRIC_LTR390_ALS_RAW, raw);
      recordMetric(METRIC_AMBIENT_LIGHT, static_cast<int32_t>(lroundf(
          ((0.6f * raw) / (LTR390_GAIN_FACTOR * LTR390_INTEGRATION_FACTOR)) * 10.0f)));
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
// BME680 / BME688 Functions (Bosch Sensortec SensorAPI)
// ---------------------------------------------------------------------------
BME68X_INTF_RET_TYPE bme68xI2cRead(uint8_t reg, uint8_t* data, uint32_t length, void* intfPtr) {
  const uint8_t address = *static_cast<uint8_t*>(intfPtr);
  Wire.beginTransmission(address);
  Wire.write(reg);
  if (Wire.endTransmission(false) != 0 ||
      Wire.requestFrom(address, static_cast<uint8_t>(length)) != length) {
    return -1;
  }
  for (uint32_t i = 0; i < length; ++i) data[i] = Wire.read();
  return BME68X_INTF_RET_SUCCESS;
}

BME68X_INTF_RET_TYPE bme68xI2cWrite(uint8_t reg, const uint8_t* data, uint32_t length, void* intfPtr) {
  const uint8_t address = *static_cast<uint8_t*>(intfPtr);
  Wire.beginTransmission(address);
  Wire.write(reg);
  if (Wire.write(data, length) != length) return -1;
  return Wire.endTransmission() == 0 ? BME68X_INTF_RET_SUCCESS : -1;
}

void bme68xDelayUs(uint32_t period, void*) {
  if (period >= 1000) {
    delay(period / 1000);
    period %= 1000;
  }
  if (period > 0) delayMicroseconds(period);
}

bool bme68xReadChipId(uint8_t address, uint8_t& chipId) {
  Wire.beginTransmission(address);
  Wire.write(BME68X_REG_CHIP_ID);
  if (Wire.endTransmission(false) != 0 ||
      Wire.requestFrom(address, static_cast<uint8_t>(1)) != 1) return false;
  chipId = Wire.read();
  return true;
}

bool initBme68x() {
  const uint8_t candidates[] = {BME68X_ADDRESS_LOW, BME68X_ADDRESS_HIGH};
  for (uint8_t address : candidates) {
    uint8_t chipId = 0;
    if (!bme68xReadChipId(address, chipId) || chipId != BME68X_CHIP_ID) continue;

    bme68xAddress = address;
    bme68xDevice = {};
    bme68xDevice.intf = BME68X_I2C_INTF;
    bme68xDevice.intf_ptr = &bme68xAddress;
    bme68xDevice.read = bme68xI2cRead;
    bme68xDevice.write = bme68xI2cWrite;
    bme68xDevice.delay_us = bme68xDelayUs;
    bme68xDevice.amb_temp = 25;
    int8_t result = bme68x_init(&bme68xDevice);
    if (result != BME68X_OK) {
      Serial.printf("[BME68X][FEHLER] Initialisierung auf 0x%02X fehlgeschlagen (%d).\n", address, result);
      return false;
    }

    struct bme68x_conf config = {};
    config.filter = BME68X_FILTER_OFF;
    config.odr = BME68X_ODR_NONE;
    config.os_hum = BME68X_OS_2X;
    config.os_pres = BME68X_OS_4X;
    config.os_temp = BME68X_OS_2X;
    result = bme68x_set_conf(&config, &bme68xDevice);
    if (result != BME68X_OK) {
      Serial.printf("[BME68X][FEHLER] Messkonfiguration fehlgeschlagen (%d).\n", result);
      return false;
    }

    struct bme68x_heatr_conf heater = {};
    heater.enable = BME68X_ENABLE;
    heater.heatr_temp = BME68X_HEATER_TEMP_C;
    heater.heatr_dur = BME68X_HEATER_DURATION_MS;
    result = bme68x_set_heatr_conf(BME68X_FORCED_MODE, &heater, &bme68xDevice);
    if (result != BME68X_OK) {
      Serial.printf("[BME68X][FEHLER] Gasheizer-Konfiguration fehlgeschlagen (%d).\n", result);
      return false;
    }

    Serial.printf("[BME68X] Bereit auf I2C 0x%02X (CHIP_ID=0x%02X), Bosch SensorAPI.\n", address, chipId);
    return true;
  }

  Serial.println(F("[BME68X][INFO] Kein BME680/BME688 mit CHIP_ID=0x61 auf 0x76 oder 0x77 erkannt."));
  return false;
}

void sampleBme68x() {
  if (!bme68xReady || static_cast<int32_t>(millis() - nextBme68xSampleMs) < 0) return;
  nextBme68xSampleMs = millis() + BME68X_SAMPLE_INTERVAL_MS;

  int8_t result = bme68x_set_op_mode(BME68X_FORCED_MODE, &bme68xDevice);
  if (result != BME68X_OK) {
    Serial.printf("[BME68X][FEHLER] Messung konnte nicht gestartet werden (%d).\n", result);
    return;
  }

  struct bme68x_conf config = {};
  config.filter = BME68X_FILTER_OFF;
  config.odr = BME68X_ODR_NONE;
  config.os_hum = BME68X_OS_2X;
  config.os_pres = BME68X_OS_4X;
  config.os_temp = BME68X_OS_2X;
  const uint32_t durationUs = bme68x_get_meas_dur(BME68X_FORCED_MODE, &config, &bme68xDevice) +
      static_cast<uint32_t>(BME68X_HEATER_DURATION_MS) * 1000UL;
  bme68xDelayUs(durationUs, nullptr);

  struct bme68x_data data = {};
  uint8_t fields = 0;
  result = bme68x_get_data(BME68X_FORCED_MODE, &data, &fields, &bme68xDevice);
  if (result != BME68X_OK || fields == 0 || (data.status & BME68X_NEW_DATA_MSK) == 0) {
    Serial.printf("[BME68X][FEHLER] Kein neuer Messwert verfügbar (%d).\n", result);
    return;
  }

  latestBme68xTemperatureC = data.temperature;
  latestBme68xHumidityPct = data.humidity;
  latestBme68xPressurePa = data.pressure;
  haveBme68xSample = true;
  recordMetric(METRIC_BME688_TEMPERATURE, static_cast<int32_t>(lroundf(data.temperature * 100.0f)));
  recordMetric(METRIC_BME688_HUMIDITY, static_cast<int32_t>(lroundf(data.humidity * 100.0f)));
  recordMetric(METRIC_PRESSURE, static_cast<int32_t>(lroundf(data.pressure / 10.0f)));

  haveBme68xGasSample = (data.status & (BME68X_GASM_VALID_MSK | BME68X_HEAT_STAB_MSK)) ==
      (BME68X_GASM_VALID_MSK | BME68X_HEAT_STAB_MSK);
  if (haveBme68xGasSample) {
    latestBme68xGasResistanceOhms = static_cast<uint32_t>(lroundf(data.gas_resistance));
    recordMetric(METRIC_BME688_GAS_RESISTANCE,
        static_cast<int32_t>(latestBme68xGasResistanceOhms > 0xFFFFFFUL
            ? 0xFFFFFFUL : latestBme68xGasResistanceOhms));
  }

  Serial.printf("[BME68X] Temp=%.2f C, Feuchte=%.2f %%, Druck=%.1f hPa",
      latestBme68xTemperatureC, latestBme68xHumidityPct, latestBme68xPressurePa / 100.0f);
  if (haveBme68xGasSample) Serial.printf(", Gaswiderstand=%lu Ohm", static_cast<unsigned long>(latestBme68xGasResistanceOhms));
  else Serial.print(F(", Gaswiderstand noch nicht stabil"));
  Serial.println();
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
uint8_t sps30Crc(const uint8_t* data, size_t length) {
  uint8_t crc = 0xFF;
  for (size_t i = 0; i < length; ++i) {
    crc ^= data[i];
    for (uint8_t bit = 0; bit < 8; ++bit) {
      crc = (crc & 0x80) ? static_cast<uint8_t>((crc << 1) ^ 0x31) : static_cast<uint8_t>(crc << 1);
    }
  }
  return crc;
}

bool sps30SetPointer(uint16_t pointer) {
  Wire.beginTransmission(SPS30_ADDRESS);
  Wire.write(static_cast<uint8_t>(pointer >> 8));
  Wire.write(static_cast<uint8_t>(pointer));
  // SPS30's Set Pointer & Read Data transfer ends the pointer write with a
  // STOP before the separate read transaction.
  return Wire.endTransmission() == 0;
}

bool sps30ReadWords(uint16_t pointer, uint8_t* output, size_t wordCount) {
  if (!sps30SetPointer(pointer)) return false;
  const size_t byteCount = wordCount * 3;
  if (Wire.requestFrom(SPS30_ADDRESS, static_cast<uint8_t>(byteCount)) != byteCount) return false;
  for (size_t word = 0; word < wordCount; ++word) {
    uint8_t pair[2];
    pair[0] = Wire.read();
    pair[1] = Wire.read();
    const int receivedCrc = Wire.read();
    if (receivedCrc < 0 || sps30Crc(pair, sizeof(pair)) != static_cast<uint8_t>(receivedCrc)) return false;
    output[word * 2] = pair[0];
    output[word * 2 + 1] = pair[1];
  }
  return true;
}

bool sps30WriteCommand(uint16_t command, const uint8_t* payload, size_t payloadLength) {
  Wire.beginTransmission(SPS30_ADDRESS);
  Wire.write(static_cast<uint8_t>(command >> 8));
  Wire.write(static_cast<uint8_t>(command));
  for (size_t offset = 0; offset < payloadLength; offset += 2) {
    const uint8_t pair[2] = {payload[offset], payload[offset + 1]};
    Wire.write(pair[0]);
    Wire.write(pair[1]);
    Wire.write(sps30Crc(pair, sizeof(pair)));
  }
  return Wire.endTransmission() == 0;
}

float sps30Float(const uint8_t* bytes) {
  const uint32_t bits = (static_cast<uint32_t>(bytes[0]) << 24) |
      (static_cast<uint32_t>(bytes[1]) << 16) |
      (static_cast<uint32_t>(bytes[2]) << 8) | bytes[3];
  float value = 0.0f;
  memcpy(&value, &bits, sizeof(value));
  return value;
}

bool initSps30() {
  // SPS30 output format 3 is IEEE754 float, encoded big-endian on the bus.
  const uint8_t outputFormat[2] = {0x03, 0x00};
  if (!sps30WriteCommand(0x0010, outputFormat, sizeof(outputFormat))) {
    Serial.println(F("[SPS30][INFO] Kein SPS30 auf I2C-Adresse 0x69 erkannt."));
    return false;
  }
  delay(20);
  Serial.println(F("[SPS30] Messung gestartet (I2C 0x69, IEEE754, 5-s-Abfrage)."));
  nextSps30SampleMs = millis();
  return true;
}

void sampleSps30() {
  if (!sps30Ready || static_cast<int32_t>(millis() - nextSps30SampleMs) < 0) return;
  nextSps30SampleMs = millis() + SPS30_SAMPLE_INTERVAL_MS;
  uint8_t ready[2] = {};
  if (!sps30ReadWords(0x0202, ready, 1) || ready[1] == 0) return;

  uint8_t data[40] = {};
  if (!sps30ReadWords(0x0300, data, 20)) {
    if (millis() - lastSps30ErrorMs >= 30000) {
      Serial.println(F("[SPS30][FEHLER] Messdaten/CRC konnten nicht gelesen werden."));
      lastSps30ErrorMs = millis();
    }
    return;
  }
  float values[10];
  for (size_t i = 0; i < 10; ++i) values[i] = sps30Float(&data[i * 4]);
  for (size_t i = 0; i < 10; ++i) {
    if (!isfinite(values[i]) || values[i] < 0.0f) return;
  }
  const uint8_t codes[10] = {METRIC_PM1_0, METRIC_PM2_5, METRIC_PM4_0, METRIC_PM10,
      METRIC_PARTICLE_NUMBER_PM0_5, METRIC_PARTICLE_NUMBER_PM1_0,
      METRIC_PARTICLE_NUMBER_PM2_5, METRIC_PARTICLE_NUMBER_PM4_0,
      METRIC_PARTICLE_NUMBER_PM10, METRIC_PARTICLE_SIZE_TYPICAL};
  for (size_t i = 0; i < 10; ++i) {
    const float scaled = values[i] * 10.0f;
    if (scaled > 8388607.0f) continue;
    recordMetric(codes[i], static_cast<int32_t>(lroundf(scaled)));
  }
  haveSps30Sample = true;
  Serial.printf("[SPS30] PM1=%.1f PM2.5=%.1f PM4=%.1f PM10=%.1f ug/m3; N0.5=%.1f #/cm3\n",
      values[0], values[1], values[2], values[3], values[4]);
}

void sampleSensors() {
  sampleSps30();
  // 1. SHT41
  int32_t shtTemp = 0;
  int32_t shtHum = 0;
  if (readSht41(shtTemp, shtHum)) {
    latestTemperatureTenths = shtTemp;
    latestHumidityTenths = shtHum;
    haveSht41Sample = true;
    recordMetric(METRIC_TEMPERATURE, shtTemp);
    recordMetric(METRIC_HUMIDITY, shtHum);
    sht41ErrorLogged = false;
    defaultCompensationLogged = false;
  } else if (!sht41ErrorLogged) {
    Serial.println(F("[SHT41][FEHLER] Messung fehlgeschlagen."));
    sht41ErrorLogged = true;
  }

  // 1b. LTR390 ALS and UV channels share one ADC and are sampled alternately.
  sampleLtr390();

  // 1c. The BME68x gas heater needs a longer forced-mode conversion, so it is
  // sampled on its own 10-second cadence instead of blocking every loop pass.
  sampleBme68x();

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
        recordMetric(METRIC_CO2, co2);
        recordMetric(METRIC_SCD41_TEMPERATURE, scdTemp);
        recordMetric(METRIC_SCD41_HUMIDITY, scdHum);
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
  recordMetric(METRIC_SGP41_VOC_INDEX, latestSgp41VocIndex);
  recordMetric(METRIC_SGP41_NOX_INDEX, latestSgp41NoxIndex);
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

uint8_t windowGroupForMetric(uint8_t code) {
  switch (code) {
    case METRIC_PM1_0: case METRIC_PM2_5: case METRIC_PM4_0: case METRIC_PM10:
    case METRIC_PARTICLE_NUMBER_PM0_5: case METRIC_PARTICLE_NUMBER_PM1_0:
    case METRIC_PARTICLE_NUMBER_PM2_5: case METRIC_PARTICLE_NUMBER_PM4_0:
    case METRIC_PARTICLE_NUMBER_PM10: case METRIC_PARTICLE_SIZE_TYPICAL: return 9;
    case METRIC_TEMPERATURE: case METRIC_HUMIDITY: return 1;
    case METRIC_CO2: case METRIC_SCD41_TEMPERATURE: case METRIC_SCD41_HUMIDITY: return 2;
    case METRIC_SGP41_VOC_INDEX: case METRIC_SGP41_NOX_INDEX: return 3;
    case METRIC_UV_INDEX: case METRIC_LTR390_UV_RAW: return 4;
    case METRIC_AMBIENT_LIGHT: case METRIC_LTR390_ALS_RAW: return 5;
    case METRIC_BME688_TEMPERATURE: case METRIC_BME688_HUMIDITY: case METRIC_PRESSURE: return 6;
    case METRIC_BME688_GAS_RESISTANCE: return 7;
    case METRIC_SOUND_LEVEL: return 8;
    default: return 0;
  }
}

bool appendInt24(uint8_t* payload, size_t& length, size_t capacity, uint8_t code,
    WindowStatistic statistic, int32_t value) {
  if (length + 4 > capacity) return false;
  payload[length++] = static_cast<uint8_t>((static_cast<uint8_t>(statistic) << 6) | (code & 0x3F));
  const uint32_t encoded = static_cast<uint32_t>(value);
  payload[length++] = static_cast<uint8_t>(encoded >> 16);
  payload[length++] = static_cast<uint8_t>(encoded >> 8);
  payload[length++] = static_cast<uint8_t>(encoded);
  return true;
}

int32_t meanForMetric(uint8_t code, const MetricWindow& window) {
  if (code == METRIC_SOUND_LEVEL && window.soundEnergySum > 0.0) {
    return static_cast<int32_t>(lround(100.0 * log10(window.soundEnergySum / window.count)));
  }
  return static_cast<int32_t>(llround(static_cast<double>(window.sum) / window.count));
}

void sendTelemetryUplink() {
  if (node == nullptr) return;
  MetricWindow snapshot[42] = {};
  snapshotMetricWindows(snapshot);
  AudioEventStats eventSnapshot[AUDIO_MODEL_CLASS_COUNT] = {};
  portENTER_CRITICAL(&audioEventMux);
  memcpy(eventSnapshot, audioEventCounts, sizeof(eventSnapshot));
  memset(audioEventCounts, 0, sizeof(audioEventCounts));
  portEXIT_CRITICAL(&audioEventMux);

  size_t metricCount = 0;
  for (uint8_t code = 1; code <= 41; ++code) if (snapshot[code].hasValue) ++metricCount;
  if (metricCount == 0) {
    Serial.println(F("[SENSOR][FEHLER] Kein Messwert im Zeitfenster; Uplink wird ausgelassen."));
    return;
  }

  uint8_t payload[MAX_WINDOW_PAYLOAD_BYTES] = {};
  size_t payloadLength = PAYLOAD_HEADER_BYTES;
  const uint64_t snapshotUs = esp_timer_get_time();
  uint32_t seconds = static_cast<uint32_t>((snapshotUs - windowStartedUs) / 1000000ULL);
  if (seconds == 0) seconds = 1;
  if (seconds > 0xFFFFFFUL) seconds = 0xFFFFFFUL;
  payload[0] = PAYLOAD_VERSION;
  payload[1] = FIRMWARE_VERSION;
  payload[2] = static_cast<uint8_t>(seconds >> 16);
  payload[3] = static_cast<uint8_t>(seconds >> 8);
  payload[4] = static_cast<uint8_t>(seconds);

  uint32_t groupCounts[10] = {};
  for (uint8_t code = 1; code <= 41; ++code) {
    const MetricWindow& window = snapshot[code];
    if (!window.hasValue) continue;
    const uint8_t group = windowGroupForMetric(code);
    if (group > 0 && window.count > groupCounts[group]) groupCounts[group] = window.count;

    // SPS30 has ten channels, so report its window means only to keep the complete
    // five-minute sensor summary below LoRaWAN's payload limit. Raw LTR390
    // diagnostics are also mean-only; other user-facing measurements retain min/mean/max.
    const bool meanOnly = code == METRIC_LTR390_UV_RAW || code == METRIC_LTR390_ALS_RAW ||
        (code >= METRIC_PM1_0 && code <= METRIC_PARTICLE_SIZE_TYPICAL);
    if (!meanOnly && !appendInt24(payload, payloadLength, MAX_WINDOW_PAYLOAD_BYTES,
        code, WINDOW_MINIMUM, window.minimum)) {
      restoreMetricWindows(snapshot);
      restoreAudioEvents(eventSnapshot);
      Serial.println(F("[UPLINK][FEHLER] Payload-Limit vor Minimum erreicht; Zeitfenster bleibt erhalten."));
      return;
    }
    if (!appendInt24(payload, payloadLength, MAX_WINDOW_PAYLOAD_BYTES,
        code, WINDOW_MEAN, meanForMetric(code, window))) {
      restoreMetricWindows(snapshot);
      restoreAudioEvents(eventSnapshot);
      Serial.println(F("[UPLINK][FEHLER] Payload-Limit vor Mittelwert erreicht; Zeitfenster bleibt erhalten."));
      return;
    }
    if (!meanOnly && !appendInt24(payload, payloadLength, MAX_WINDOW_PAYLOAD_BYTES,
        code, WINDOW_MAXIMUM, window.maximum)) {
      restoreMetricWindows(snapshot);
      restoreAudioEvents(eventSnapshot);
      Serial.println(F("[UPLINK][FEHLER] Payload-Limit vor Maximum erreicht; Zeitfenster bleibt erhalten."));
      return;
    }
  }
  for (uint8_t group = 1; group <= 9; ++group) {
    if (groupCounts[group] == 0) continue;
    const uint8_t code = group == 9 ? SPS30_SAMPLE_COUNT_CODE : static_cast<uint8_t>(49 + group);
    const uint32_t count = groupCounts[group] > 0xFFFFFFUL ? 0xFFFFFFUL : groupCounts[group];
    if (!appendInt24(payload, payloadLength, MAX_WINDOW_PAYLOAD_BYTES,
        code, WINDOW_COUNT, static_cast<int32_t>(count))) {
      restoreMetricWindows(snapshot);
      restoreAudioEvents(eventSnapshot);
      Serial.println(F("[UPLINK][FEHLER] Payload-Limit vor Samplecount erreicht; Zeitfenster bleibt erhalten."));
      return;
    }
  }

  uint8_t soundEventsReported = 0;
  for (size_t classIndex = 0; classIndex < AUDIO_MODEL_CLASS_COUNT; ++classIndex) {
    if (eventSnapshot[classIndex].count == 0) continue;
    if (payloadLength + 4 > MAX_WINDOW_PAYLOAD_BYTES) break;
    payload[payloadLength] = (WINDOW_TAG_EVENT << 6) | SOUND_EVENT_CODE;
    payload[payloadLength + 1] = static_cast<uint8_t>(classIndex);
    payload[payloadLength + 2] = eventSnapshot[classIndex].count > 255
        ? 255 : static_cast<uint8_t>(eventSnapshot[classIndex].count);
    payload[payloadLength + 3] = static_cast<uint8_t>(
        lroundf(eventSnapshot[classIndex].maxScore * 100.0f));
    payloadLength += 4;
    ++soundEventsReported;
  }

  if (payloadLength > MAX_WINDOW_PAYLOAD_BYTES) {
    restoreMetricWindows(snapshot);
    restoreAudioEvents(eventSnapshot);
    Serial.printf("[UPLINK][FEHLER] Zeitfenster-Payload zu gross: %u Byte.\n",
        static_cast<unsigned>(payloadLength));
    return;
  }

  Serial.printf("[UPLINK] Format=%u, firmware=v%u, Zeitfenster=%lu s, Messgroessen=%u, AudioEvents=%u, payload=%u Byte\n",
      payload[0], FIRMWARE_VERSION, static_cast<unsigned long>(seconds),
      static_cast<unsigned>(metricCount), static_cast<unsigned>(soundEventsReported),
      static_cast<unsigned>(payloadLength));

  uint8_t downlink[16];
  size_t downlinkLength = sizeof(downlink);
  const int16_t state = node->sendReceive(payload, payloadLength, UPLINK_FPORT,
      downlink, &downlinkLength);
  persistLoRaWANSecurityState();
  if (state < RADIOLIB_ERR_NONE) {
    restoreMetricWindows(snapshot);
    restoreAudioEvents(eventSnapshot);
    Serial.printf("[UPLINK][FEHLER] Senden/Empfang fehlgeschlagen: %d; Zeitfenster bleibt gepuffert.\n", state);
    if (state == RADIOLIB_ERR_NETWORK_NOT_JOINED) {
      Serial.println(F("[LORAWAN] Keine aktive Sitzung; Rejoin wird eingeplant."));
      node->clearSession();
      persistLoRaWANSecurityState();
      joined = false;
      scheduleJoinRetry();
    }
  } else {
    windowStartedUs = snapshotUs;
    Serial.println(F("[UPLINK] Zeitfenster wurde an den LoRaWAN-Stack uebergeben."));
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
      else if (address == SPS30_ADDRESS) Serial.print(F(" (SPS30)"));
      else if (address == SGP41_ADDRESS) Serial.print(F(" (SGP41)"));
      else if (address == SCD41_ADDRESS) Serial.print(F(" (SCD41)"));
      else if (address == LTR390_ADDRESS) Serial.print(F(" (LTR390)"));
      else if (address == BME68X_ADDRESS_LOW || address == BME68X_ADDRESS_HIGH) Serial.print(F(" (BME68x)"));
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
  Serial.printf("=== KAMUE RAK3112 / RAK3212 Firmware v%u ===\n", FIRMWARE_VERSION);
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

  // Initialize and start the optional Sensirion SPS30 particulate sensor.
  sps30Ready = initSps30();

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
  bme68xReady = initBme68x();
  i2sMicReady = initI2sMicrophone();
  if (i2sMicReady && !initAudioMl()) {
    Serial.println(F("[AUDIO-ML][WARNUNG] ML deaktiviert; Mikrofon-Schallpegel laeuft weiter."));
  }
  windowStartedUs = esp_timer_get_time();
  if (i2sMicReady) {
    const BaseType_t taskCreated = xTaskCreatePinnedToCore(
        microphoneTask, "rak-mic-window", 8192, nullptr, 3, &i2sMicTaskHandle, 0);
    if (taskCreated != pdPASS) {
      i2sMicReady = false;
      Serial.println(F("[I2S-MIC][FEHLER] Kontinuierliche Audio-Task konnte nicht gestartet werden."));
    }
  }

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
    if (sgp41Ready || scd41Ready || ltr390Ready || bme68xReady || sps30Ready) {
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
    bool sgpReadyCondition = !sgp41Ready || haveSgp41Sample;
    bool scdReadyCondition = !scd41Ready || haveScd41Sample;
    bool ltrReadyCondition = !ltr390Ready || (haveLtr390UvSample && haveLtr390AlsSample);
    bool bmeReadyCondition = !bme68xReady || haveBme68xSample;
    bool spsReadyCondition = !sps30Ready || haveSps30Sample;
    if (sgpReadyCondition && scdReadyCondition && ltrReadyCondition && bmeReadyCondition && spsReadyCondition) {
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
      bool sgpReadyCondition = !sgp41Ready || haveSgp41Sample;
      bool scdReadyCondition = !scd41Ready || haveScd41Sample;
      bool ltrReadyCondition = !ltr390Ready || (haveLtr390UvSample && haveLtr390AlsSample);
      bool bmeReadyCondition = !bme68xReady || haveBme68xSample;
      bool spsReadyCondition = !sps30Ready || haveSps30Sample;
      if (!sgpReadyCondition || !scdReadyCondition || !ltrReadyCondition || !bmeReadyCondition || !spsReadyCondition) {
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
