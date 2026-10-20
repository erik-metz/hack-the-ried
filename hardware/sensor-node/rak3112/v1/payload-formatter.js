// RAK3112 uplink decoder. Formats 3/4 are point samples; format 5 is a window summary.
function decodeUplink(input) {
  const bytes = input.bytes;
  if (input.fPort !== undefined && input.fPort !== 10) return { errors: ["Unsupported FPort; expected 10"] };
  if (!Array.isArray(bytes) || bytes.length === 0) return { errors: ["Payload is empty"] };
  const version = bytes[0];
  if (version !== 3 && version !== 4 && version !== 5) return { errors: ["Unsupported payload version: " + version] };
  if (version === 5) {
    if (bytes.length < 9 || (bytes.length - 5) % 4 !== 0 || bytes.length > 222) {
      return { errors: ["Window payload has an invalid length"] };
    }
    const windowSeconds = (bytes[2] << 16) | (bytes[3] << 8) | bytes[4];
    if (windowSeconds < 1) return { errors: ["Window duration must be positive"] };
    const definitions = {
      1:["temperature","°C",0.1],2:["humidity","%",0.1],3:["uv_index","index",0.01],4:["co2","ppm",1],
      5:["scd41_temperature","°C",0.01],6:["scd41_humidity","%",0.01],7:["sound_level","dBFS",0.1],
      8:["pm1_0","µg/m³",0.1],9:["pm2_5","µg/m³",0.1],10:["pm4_0","µg/m³",0.1],11:["pm10","µg/m³",0.1],
      12:["particle_number_pm0_5","#/cm³",0.1],13:["particle_number_pm1_0","#/cm³",0.1],
      14:["particle_number_pm2_5","#/cm³",0.1],15:["particle_number_pm4_0","#/cm³",0.1],
      16:["particle_number_pm10","#/cm³",0.1],17:["particle_size_typical","nm",1],
      18:["bme688_temperature","°C",0.01],19:["bme688_humidity","%",0.01],20:["pressure","hPa",0.1],
      21:["bme688_gas_resistance","Ω",1],22:["bme688_iaq","index",0.1],23:["bme688_static_iaq","index",0.1],
      24:["bme688_co2_equivalent","ppm",1],25:["bme688_bvoc_equivalent","ppm",0.01],26:["bme688_gas_percentage","%",0.1],
      29:["sgp41_voc_index","index",1],30:["sgp41_nox_index","index",1],
      31:["ambient_light","lux",0.1],32:["ltr390_uv_raw","raw",1],33:["ltr390_als_raw","raw",1],
      34:["rain_detected","bool",1],35:["rain_pulses","count",1],36:["bus_voltage","mV",1],
      37:["shunt_voltage","µV",1],38:["current","mA",1],39:["power","mW",1],
      40:["sound_dominant_frequency","Hz",1],41:["sound_event_class","class",1]
    };
    const groupForMetric = {1:1,2:1,4:2,5:2,6:2,29:3,30:3,3:4,32:4,31:5,33:5,18:6,19:6,20:6,21:7,7:8};
    const groups = {}, stats = {}, seen = {};
    for (let offset = 5; offset < bytes.length; offset += 4) {
      const tag = bytes[offset] >> 6;
      const code = bytes[offset] & 0x3F;
      const rawUnsigned = (bytes[offset+1] << 16) | (bytes[offset+2] << 8) | bytes[offset+3];
      if (tag === 3) {
        if (code < 50 || code > 57 || groups[code] !== undefined) return { errors: ["Invalid or duplicate window sample-count group: " + code] };
        groups[code] = rawUnsigned;
        continue;
      }
      if (!definitions[code]) return { errors: ["Unsupported window metric code: " + code] };
      const key = code + ":" + tag;
      if (seen[key]) return { errors: ["Duplicate window statistic: " + key] };
      seen[key] = true;
      let raw = rawUnsigned;
      if (code !== 21 && (rawUnsigned & 0x800000)) raw = rawUnsigned - 0x1000000;
      const definition = definitions[code];
      const value = Math.round(raw * definition[2] * 1000) / 1000;
      if (!stats[code]) stats[code] = { metric: definition[0], unit: definition[1], minimum: null, mean: null, maximum: null, sample_count: null };
      if (tag === 0) stats[code].minimum = value;
      else if (tag === 1) stats[code].mean = value;
      else if (tag === 2) stats[code].maximum = value;
    }
    const measurements = [], windowStatistics = [];
    Object.keys(stats).forEach(function (code) {
      const item = stats[code];
      if (item.mean === null) return;
      const group = groupForMetric[code];
      item.sample_count = group ? (groups[49 + group] || 0) : 0;
      measurements.push({metric:item.metric,unit:item.unit,value:item.mean});
      windowStatistics.push({metric:item.metric,unit:item.unit,min_value:item.minimum,
        mean_value:item.mean,max_value:item.maximum,sample_count:item.sample_count});
    });
    if (!measurements.length) return { errors: ["Window payload contains no metric means"] };
    const data = {version:5,firmware_version:bytes[1],window_seconds:windowSeconds,
      measurements:measurements,window_statistics:windowStatistics};
    return {data:data};
  }
  const legacyHeaderBytes = version === 3 ? 1 : 2;
  if (bytes.length < legacyHeaderBytes + 5 || (bytes.length - legacyHeaderBytes) % 5 !== 0) return { errors: ["Payload has an invalid length"] };
  if ((bytes.length - legacyHeaderBytes) / 5 > 41) return { errors: ["Payload contains more than 41 measurements"] };
  const definitions = {
    1:["temperature","°C",0.1],2:["humidity","%",0.1],3:["uv_index","index",0.01],4:["co2","ppm",1],
    5:["scd41_temperature","°C",0.01],6:["scd41_humidity","%",0.01],7:["sound_level","dBFS",0.1],
    8:["pm1_0","µg/m³",0.1],9:["pm2_5","µg/m³",0.1],10:["pm4_0","µg/m³",0.1],11:["pm10","µg/m³",0.1],
    12:["particle_number_pm0_5","#/cm³",0.1],13:["particle_number_pm1_0","#/cm³",0.1],
    14:["particle_number_pm2_5","#/cm³",0.1],15:["particle_number_pm4_0","#/cm³",0.1],
    16:["particle_number_pm10","#/cm³",0.1],17:["particle_size_typical","nm",1],
    18:["bme688_temperature","°C",0.01],19:["bme688_humidity","%",0.01],20:["pressure","hPa",0.1],
    21:["bme688_gas_resistance","Ω",1],22:["bme688_iaq","index",0.1],23:["bme688_static_iaq","index",0.1],
    24:["bme688_co2_equivalent","ppm",1],25:["bme688_bvoc_equivalent","ppm",0.01],26:["bme688_gas_percentage","%",0.1],
    27:["sgp41_voc_raw","raw",1],28:["sgp41_nox_raw","raw",1],29:["sgp41_voc_index","index",1],30:["sgp41_nox_index","index",1],
    31:["ambient_light","lux",0.1],32:["ltr390_uv_raw","raw",1],33:["ltr390_als_raw","raw",1],
    34:["rain_detected","bool",1],35:["rain_pulses","count",1],36:["bus_voltage","mV",1],
    37:["shunt_voltage","µV",1],38:["current","mA",1],39:["power","mW",1],
    40:["sound_dominant_frequency","Hz",1],41:["sound_event_class","class",1]
  };
  const measurements = [], unknownMeasurements = [], seen = {};
  for (let offset = legacyHeaderBytes; offset < bytes.length; offset += 5) {
    const code = bytes[offset];
    if (seen[code]) return { errors: ["Duplicate metric code: " + code] };
    seen[code] = true;
    // Legacy firmware used 27/28 for SGP41 raw signals. Do not forward them.
    if (code === 27 || code === 28) continue;
    const raw = (bytes[offset+1] << 24) | (bytes[offset+2] << 16) | (bytes[offset+3] << 8) | bytes[offset+4];
    const definition = definitions[code];
    if (definition) measurements.push({metric:definition[0],unit:definition[1],value:Math.round(raw*definition[2]*1000)/1000});
    else {
      measurements.push({metric:"metric_"+code,unit:"raw",value:raw});
      unknownMeasurements.push({code:code,raw_value:raw});
    }
  }
  const data = {version:version,measurements:measurements};
  if (version === 4) data.firmware_version = bytes[1];
  if (unknownMeasurements.length) data.unknown_measurements = unknownMeasurements;
  return {data:data};
}
