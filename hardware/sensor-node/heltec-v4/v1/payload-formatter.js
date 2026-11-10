// Heltec tracker v1/v2: GPS port 44; shared update feedback ports 42/43.
function decodeUplink(input) {
  if (input.fPort !== 44) return decodeLabUplink(input);
  const b=input.bytes;
  const fail=message=>({data:{},errors:[message]});
  if(!Array.isArray(b)||b.length<10||b.some(x=>!Number.isInteger(x)||x<0||x>255)) return fail('Invalid tracker bytes');
  const u16=i=>b[i]*256+b[i+1];
  const u32=i=>b[i]*16777216+b[i+1]*65536+b[i+2]*256+b[i+3];
  const i32=i=>u32(i)>2147483647?u32(i)-4294967296:u32(i);

  // Version 2: 5-minute batched GPS telemetry
  if (b[0] === 2) {
    const mask = b[1];
    if (mask & 224) return fail('Invalid fix mask (bits 5-7 must be 0)');
    let fixCount = 0;
    for (let i = 0; i < 5; ++i) if (mask & (1 << i)) fixCount++;
    const expectedLen = 8 + fixCount * 11 + 2;
    if (b.length !== expectedLen) return fail(`Expected ${expectedLen} bytes for ${fixCount} fixes, got ${b.length}`);
    const fw = b[b.length - 2];
    const testVal = b[b.length - 1];
    if (![1, 2].includes(fw) || testVal !== (fw === 1 ? 111 : 222)) return fail('Invalid firmware version or test value');

    const counter = u32(2);
    const batMv = u16(6);
    const battery_v = (batMv >= 2800 && batMv <= 4500) ? batMv / 1000 : null;
    const positions = [];
    let offset = 8;
    for (let slot = 0; slot < 5; ++slot) {
      const offsetSeconds = (slot - 4) * 60; // slot 0: -240s, ..., slot 4: 0s
      if (mask & (1 << slot)) {
        const lat = i32(offset) / 1e7;
        const lon = i32(offset + 4) / 1e7;
        const rawAlt = u16(offset + 8);
        const alt = rawAlt > 32767 ? rawAlt - 65536 : rawAlt;
        const sats = b[offset + 10];
        if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return fail(`Invalid coordinates at slot ${slot}`);
        positions.push({
          slot,
          offset_seconds: offsetSeconds,
          has_fix: true,
          latitude: lat,
          longitude: lon,
          altitude: alt,
          satellites: sats
        });
        offset += 11;
      } else {
        positions.push({
          slot,
          offset_seconds: offsetSeconds,
          has_fix: false
        });
      }
    }
    const latestFix = [...positions].reverse().find(p => p.has_fix);
    const data = {
      version: 2,
      counter,
      fix_count: fixCount,
      positions,
      firmware: fw,
      test_value: testVal
    };
    if (battery_v !== null) data.battery_v = battery_v;
    if (latestFix) {
      data.latitude = latestFix.latitude;
      data.longitude = latestFix.longitude;
      data.altitude = latestFix.altitude;
      data.gps_fix = true;
    } else {
      data.gps_fix = false;
    }
    return { data, warnings: fixCount > 0 ? [] : ['No GPS fixes in 5-minute window'], errors: [] };
  }

  // Version 1: single 24-byte packet
  if (b.length !== 24) return fail('Expected 24 tracker bytes for version 1');
  if (b[0] !== 1 || (b[1] & 240) || ![1, 2].includes(b[22]) || b[23] !== (b[22] === 1 ? 111 : 222)) return fail('Invalid tracker version or flags');
  const fix = !!(b[1] & 1), alt = !!(b[1] & 2), hdop = !!(b[1] & 4), battery = !!(b[1] & 8);
  if ((alt && !fix) || (!fix && (u32(6) || u32(10) || u16(14) || b[21] !== 255)) ||
      (fix && (Math.abs(i32(6)) > 900000000 || Math.abs(i32(10)) > 1800000000 || b[21] >= 10)) ||
      (!alt && u16(14)) || (!hdop && u16(17)) || (!battery && u16(19)) ||
      (battery && (u16(19) < 2800 || u16(19) > 4500))) return fail('Invalid tracker fields');
  const data = { version: 1, counter: u32(2), gps_fix: fix, satellites: b[16], firmware: b[22], test_value: b[23] };
  if (fix) { data.latitude = i32(6) / 1e7; data.longitude = i32(10) / 1e7; data.fix_age_s = b[21]; }
  if (alt) { const a = u16(14); data.altitude = a > 32767 ? a - 65536 : a; }
  if (hdop) data.hdop = u16(17) / 100;
  if (battery) data.battery_v = u16(19) / 1000;
  return { data, warnings: fix ? [] : ['No fresh GPS fix; no coordinates reported'], errors: [] };
}
function decodeLabUplink(input) {
  var b = input.bytes;
  var u32 = function(i) {return b[i]*16777216+b[i+1]*65536+b[i+2]*256+b[i+3];};
  if (input.fPort === 43 && b.length >= 14 && b.length <= 30 && b.length % 2 === 0 && b[0] === 1) {
    var missing = [];
    for (var i=14;i<b.length;i+=2) missing.push(b[i]*256+b[i+1]);
    return {data:{fuota_state:b[1],session:u32(2),received_blocks:u32(6),total_blocks:u32(10),missing_blocks:missing}};
  }
  if (input.fPort !== 42 || b.length !== 8 || b[0] !== 1) {
    return {errors: ['Expected FUOTA lab format 1: port 42, 8 bytes']};
  }
  return {data: {
    test_firmware: b[1],
    test_value: b[2] * 256 + b[3],
    counter: b[4] * 16777216 + b[5] * 65536 + b[6] * 256 + b[7]
  }};
}
