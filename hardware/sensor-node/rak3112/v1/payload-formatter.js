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
  if ((bytes.length - 1) / 5 > 32) {
    return { errors: ["Version 3 payload contains more than 32 measurements"] };
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
