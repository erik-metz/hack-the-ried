// RAK3112 uplink decoder. Formats 3/4: samples; 5/6: TLV windows; 7/8: compact windows.
function decodeCompactWindow(bytes) {
  if (bytes.length < 17 || bytes.length > 222 || bytes.some(function (b) {
    return !Number.isInteger(b) || b < 0 || b > 255;
  })) return { errors: ["Invalid compact payload length or byte"] };
  const seconds = bytes[2] * 65536 + bytes[3] * 256 + bytes[4];
  if (!seconds) return { errors: ["Window duration must be positive"] };
  // code, sensor group, default byte width, signed, mean-only. Versioned wire schema.
  const fields = [
    [1,1,2,true,false],[2,1,2,false,false],[3,4,2,false,false],[4,2,2,false,false],
    [5,2,2,true,false],[6,2,2,false,false],[7,8,2,true,false],
    [8,9,2,false,true],[9,9,2,false,true],[10,9,2,false,true],[11,9,2,false,true],
    [12,9,3,false,true],[13,9,3,false,true],[14,9,3,false,true],
    [15,9,3,false,true],[16,9,3,false,true],[17,9,2,false,true],
    [18,6,2,true,false],[19,6,2,false,false],[20,6,2,false,false],[21,7,3,false,false],
    [29,3,2,false,false],[30,3,2,false,false],[31,5,3,false,false],
    [32,4,3,false,true],[33,5,3,false,true]
  ];
  if (bytes[0] === 8) fields.push([36,10,2,false,false], [37,10,3,true,false],
    [38,10,3,true,false], [39,10,4,true,false]);
  const allowed = [0,0,0,0,0,0];
  fields.forEach(function (field) { allowed[(field[0]-1) >> 3] |= 1 << ((field[0]-1) % 8); });
  for (let i = 0; i < 6; ++i) {
    if ((bytes[5+i] & ~allowed[i]) || (bytes[11+i] & ~bytes[5+i])) {
      return { errors: ["Invalid compact presence or wide bitmap"] };
    }
  }
  const definitions = windowDefinitions(), classes = windowAudioClasses();
  // Formats 3-7 retain whole mA/mW. Format 8 carries microamps/microwatts,
  // decoded into the same mA/mW units with three decimal places.
  if (bytes[0] === 8) { definitions[38][2] = 0.001; definitions[39][2] = 0.001; }
  const statistics = [], groups = {};
  let offset = 17;
  function read(width, signed) {
    if (offset + width > bytes.length) throw new Error("Truncated compact payload");
    let value = 0;
    for (let i = 0; i < width; ++i) value = value * 256 + bytes[offset++];
    if (signed && value >= Math.pow(2, width*8-1)) value -= Math.pow(2, width*8);
    return value;
  }
  try {
    fields.forEach(function (field) {
      const code = field[0], byte = (code-1) >> 3, bit = 1 << ((code-1) % 8);
      if (!(bytes[5+byte] & bit)) return;
      const wide = !!(bytes[11+byte] & bit), width = wide ? 4 : field[2];
      const signed = wide || field[3], definition = definitions[code];
      function value() { return Math.round(read(width, signed) * definition[2] * 1000) / 1000; }
      const minimum = field[4] ? null : value(), mean = value(), maximum = field[4] ? null : value();
      if ((minimum !== null && minimum > mean) || (maximum !== null && mean > maximum)) {
        throw new Error("Invalid compact statistic range");
      }
      statistics.push({metric:definition[0],unit:definition[1],min_value:minimum,
        mean_value:mean,max_value:maximum,sample_count:0,group:field[1]});
      groups[field[1]] = 0;
    });
    if (!statistics.length) throw new Error("Compact payload has no measurements");
    for (let group = 1; group <= (bytes[0] === 8 ? 10 : 9); ++group) {
      if (groups[group] === undefined) continue;
      groups[group] = read(3, false);
      if (!groups[group]) throw new Error("Compact sample count must be positive");
    }
    statistics.forEach(function (item) { item.sample_count = groups[item.group]; delete item.group; });
    if ((bytes.length-offset) % 3) throw new Error("Invalid compact audio record length");
    const events = [], seen = {};
    while (offset < bytes.length) {
      const classId = read(1, false), count = read(1, false), score = read(1, false);
      if (!classes[classId] || seen[classId] || !count || score > 100) throw new Error("Invalid compact audio event");
      seen[classId] = true;
      events.push({class_id:classId,class:classes[classId],count:count,max_score:score/100});
    }
    return {data:{version:bytes[0],firmware_version:bytes[1],window_seconds:seconds,
      measurements:statistics.map(function (item) { return {metric:item.metric,unit:item.unit,value:item.mean_value}; }),
      window_statistics:statistics,sound_events:events}};
  } catch (error) {
    return {errors:[error.message]};
  }
}

function decodeUplink(input) {
  const bytes = input.bytes;
  if (input.fPort !== undefined && input.fPort !== 10) return { errors: ["Unsupported FPort; expected 10"] };
  if (!Array.isArray(bytes) || bytes.length === 0) return { errors: ["Payload is empty"] };
  const version = bytes[0];
  if (version === 7 || version === 8) return decodeCompactWindow(bytes);
  if (version !== 3 && version !== 4 && version !== 5 && version !== 6) return { errors: ["Unsupported payload version: " + version] };
  if (version === 5 || version === 6) {
    if (bytes.length < 9 || bytes.length > 222) {
      return { errors: ["Window payload has an invalid length"] };
    }
    const windowSeconds = (bytes[2] << 16) | (bytes[3] << 8) | bytes[4];
    if (windowSeconds < 1) return { errors: ["Window duration must be positive"] };
    const definitions = windowDefinitions();
    const audioClasses = windowAudioClasses();
    const groupForMetric = windowGroups();
    const groups = {}, stats = {}, seen = {}, soundEvents = [];
    if ((bytes.length - 5) % 4 !== 0) return { errors: ["Window payload has an invalid length"] };
    for (let offset = 5; offset < bytes.length; offset += 4) {
      const tag = bytes[offset] >> 6;
      const code = bytes[offset] & 0x3F;
      if (tag === 3 && code === 58) {
        const classId = bytes[offset + 1];
        const count = bytes[offset + 2];
        const maxScorePct = bytes[offset + 3];
        const className = audioClasses[classId] || ("class_" + classId);
        soundEvents.push({
          class_id: classId,
          class: className,
          count: count,
          max_score: Math.round((maxScorePct / 100) * 1000) / 1000
        });
        continue;
      }
      const rawUnsigned = (bytes[offset+1] << 16) | (bytes[offset+2] << 8) | bytes[offset+3];
      if (tag === 3) {
        if (!((code >= 50 && code <= 57) || code === 59) || groups[code] !== undefined) return { errors: ["Invalid or duplicate window sample-count group: " + code] };
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
      item.sample_count = group ? (groups[group === 9 ? 59 : 49 + group] || 0) : 0;
      measurements.push({metric:item.metric,unit:item.unit,value:item.mean});
      windowStatistics.push({metric:item.metric,unit:item.unit,min_value:item.minimum,
        mean_value:item.mean,max_value:item.maximum,sample_count:item.sample_count});
    });
    if (!measurements.length) return { errors: ["Window payload contains no metric means"] };
    const data = {version:version,firmware_version:bytes[1],window_seconds:windowSeconds,
      measurements:measurements,window_statistics:windowStatistics};
    if (version === 6) {
      data.sound_events = soundEvents;
    }
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
    16:["particle_number_pm10","#/cm³",0.1],17:["particle_size_typical","µm",0.1],
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

function windowDefinitions() {
  return {
      1:["temperature","°C",0.1],2:["humidity","%",0.1],3:["uv_index","index",0.01],4:["co2","ppm",1],
      5:["scd41_temperature","°C",0.01],6:["scd41_humidity","%",0.01],7:["sound_level","dBFS",0.1],
      8:["pm1_0","µg/m³",0.1],9:["pm2_5","µg/m³",0.1],10:["pm4_0","µg/m³",0.1],11:["pm10","µg/m³",0.1],
      12:["particle_number_pm0_5","#/cm³",0.1],13:["particle_number_pm1_0","#/cm³",0.1],
      14:["particle_number_pm2_5","#/cm³",0.1],15:["particle_number_pm4_0","#/cm³",0.1],
      16:["particle_number_pm10","#/cm³",0.1],17:["particle_size_typical","µm",0.1],
      18:["bme688_temperature","°C",0.01],19:["bme688_humidity","%",0.01],20:["pressure","hPa",0.1],
      21:["bme688_gas_resistance","Ω",1],22:["bme688_iaq","index",0.1],23:["bme688_static_iaq","index",0.1],
      24:["bme688_co2_equivalent","ppm",1],25:["bme688_bvoc_equivalent","ppm",0.01],26:["bme688_gas_percentage","%",0.1],
      29:["sgp41_voc_index","index",1],30:["sgp41_nox_index","index",1],
      31:["ambient_light","lux",0.1],32:["ltr390_uv_raw","raw",1],33:["ltr390_als_raw","raw",1],
      34:["rain_detected","bool",1],35:["rain_pulses","count",1],36:["bus_voltage","mV",1],
      37:["shunt_voltage","µV",1],38:["current","mA",1],39:["power","mW",1],
      40:["sound_dominant_frequency","Hz",1],41:["sound_event_class","class",1]
    };
}

function windowAudioClasses() {
  return [
      "dog","rooster","pig","cow","frog","cat","hen","insects","sheep","crow",
      "rain","sea_waves","crackling_fire","crickets","chirping_birds","water_drops","wind",
      "pouring_water","toilet_flush","thunderstorm","crying_baby","sneezing","clapping",
      "breathing","coughing","footsteps","laughing","brushing_teeth","snoring","drinking_sipping",
      "door_wood_knock","mouse_click","keyboard_typing","door_wood_creaks","can_opening",
      "washing_machine","vacuum_cleaner","clock_alarm","clock_tick","glass_breaking","helicopter",
      "chainsaw","siren","car_horn","engine","train","church_bells","airplane","fireworks","hand_saw"
    ];
}

function windowGroups() {
  return {1:1,2:1,4:2,5:2,6:2,29:3,30:3,3:4,32:4,31:5,33:5,18:6,19:6,20:6,21:7,7:8,
      8:9,9:9,10:9,11:9,12:9,13:9,14:9,15:9,16:9,17:9};
}
