// The Things Stack uplink formatter for RAK3112 FPort 10.
// Keep metric IDs and scales aligned with v1.ino and the protocol table in README.md.
function decodeUplink(input) {
  const bytes = input.bytes;
  if (input.fPort !== undefined && input.fPort !== 10) {
    return { errors: ["Unsupported FPort; expected 10"] };
  }
  if (!Array.isArray(bytes) || bytes.length === 0) {
    return { errors: ["Payload is empty"] };
  }

  const version = bytes[0];
  if (version === 2) return decodeVersion2(bytes);
  if (version !== 3) return { errors: [`Unsupported payload version: ${version}`] };
  if (bytes.length < 6 || (bytes.length - 1) % 5 !== 0) {
    return { errors: ["Version 3 payload must contain complete 5-byte measurement records"] };
  }
  if ((bytes.length - 1) / 5 > 41) {
    return { errors: ["Version 3 payload contains more than 41 measurements"] };
  }

  const measurements = [];
  const unknownMeasurements = [];
  const seenCodes = new Set();
  for (let offset = 1; offset < bytes.length; offset += 5) {
    const code = bytes[offset];
    if (seenCodes.has(code)) {
      return { errors: [`Duplicate metric code: ${code}`] };
    }
    seenCodes.add(code);
    const raw = (bytes[offset + 1] << 24) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 8) |
      bytes[offset + 4];
    const decoded = decodeMetric(code, raw);
    if (decoded) measurements.push(decoded);
    else {
      // Preserve unregistered values through integrations and the database.
      measurements.push({ metric: `metric_${code}`, unit: "raw", value: raw });
      unknownMeasurements.push({ code, raw_value: raw });
    }
  }
  const data = { version, measurements };
  if (unknownMeasurements.length) data.unknown_measurements = unknownMeasurements;
  return { data };
}

function decodeMetric(code, raw) {
  switch (code) {
    case 1: return { metric: "temperature", unit: "°C", value: raw / 10 };
    case 2: return { metric: "humidity", unit: "%", value: raw / 10 };
    case 3: return { metric: "uv_index", unit: "index", value: raw / 100 };
    case 4: return { metric: "co2", unit: "ppm", value: raw };
    case 5: return { metric: "scd41_temperature", unit: "°C", value: raw / 100 };
    case 6: return { metric: "scd41_humidity", unit: "%", value: raw / 100 };
    case 7: return { metric: "sound_level", unit: "dBFS", value: raw / 10 };
    case 8: return { metric: "pm1_0", unit: "µg/m³", value: raw / 10 };
    case 9: return { metric: "pm2_5", unit: "µg/m³", value: raw / 10 };
    case 10: return { metric: "pm4_0", unit: "µg/m³", value: raw / 10 };
    case 11: return { metric: "pm10", unit: "µg/m³", value: raw / 10 };
    case 12: return { metric: "particle_number_pm0_5", unit: "#/cm³", value: raw / 10 };
    case 13: return { metric: "particle_number_pm1_0", unit: "#/cm³", value: raw / 10 };
    case 14: return { metric: "particle_number_pm2_5", unit: "#/cm³", value: raw / 10 };
    case 15: return { metric: "particle_number_pm4_0", unit: "#/cm³", value: raw / 10 };
    case 16: return { metric: "particle_number_pm10", unit: "#/cm³", value: raw / 10 };
    case 17: return { metric: "particle_size_typical", unit: "nm", value: raw };
    case 18: return { metric: "bme688_temperature", unit: "°C", value: raw / 100 };
    case 19: return { metric: "bme688_humidity", unit: "%", value: raw / 100 };
    case 20: return { metric: "pressure", unit: "hPa", value: raw / 10 };
    case 21: return { metric: "bme688_gas_resistance", unit: "Ω", value: raw };
    case 22: return { metric: "bme688_iaq", unit: "index", value: raw / 10 };
    case 23: return { metric: "bme688_static_iaq", unit: "index", value: raw / 10 };
    case 24: return { metric: "bme688_co2_equivalent", unit: "ppm", value: raw };
    case 25: return { metric: "bme688_bvoc_equivalent", unit: "ppm", value: raw / 100 };
    case 26: return { metric: "bme688_gas_percentage", unit: "%", value: raw / 10 };
    case 27: return { metric: "sgp41_voc_raw", unit: "raw", value: raw };
    case 28: return { metric: "sgp41_nox_raw", unit: "raw", value: raw };
    case 29: return { metric: "sgp41_voc_index", unit: "index", value: raw };
    case 30: return { metric: "sgp41_nox_index", unit: "index", value: raw };
    case 31: return { metric: "ambient_light", unit: "lux", value: raw / 10 };
    case 32: return { metric: "ltr390_uv_raw", unit: "raw", value: raw };
    case 33: return { metric: "ltr390_als_raw", unit: "raw", value: raw };
    case 34: return { metric: "rain_detected", unit: "bool", value: raw };
    case 35: return { metric: "rain_pulses", unit: "count", value: raw };
    case 36: return { metric: "bus_voltage", unit: "mV", value: raw };
    case 37: return { metric: "shunt_voltage", unit: "µV", value: raw };
    case 38: return { metric: "current", unit: "mA", value: raw };
    case 39: return { metric: "power", unit: "mW", value: raw };
    case 40: return { metric: "sound_dominant_frequency", unit: "Hz", value: raw };
    case 41: return { metric: "sound_event_class", unit: "class", value: raw };
    default: return undefined;
  }
}

function decodeVersion2(bytes) {
  if (bytes.length !== 5) return { errors: ["Version 2 payload must be exactly 5 bytes"] };
  let temperature = (bytes[1] << 8) | bytes[2];
  if (temperature & 0x8000) temperature -= 0x10000;
  const humidity = (bytes[3] << 8) | bytes[4];
  return {
    data: {
      version: 2,
      measurements: [
        { metric: "temperature", unit: "°C", value: temperature / 10 },
        { metric: "humidity", unit: "%", value: humidity / 10 },
      ],
    },
  };
}
