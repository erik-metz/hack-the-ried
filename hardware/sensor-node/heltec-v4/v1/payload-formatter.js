// Heltec tracker v1: GPS port 44; shared update feedback ports 42/43.
function decodeUplink(input) {
  if (input.fPort !== 44) return decodeLabUplink(input);
  const b=input.bytes;
  const fail=message=>({data:{},errors:[message]});
  if(!Array.isArray(b)||b.length!==24||b.some(x=>!Number.isInteger(x)||x<0||x>255)) return fail('Expected 24 tracker bytes');
  if(b[0]!==1 || (b[1]&240) || ![1,2].includes(b[22]) || b[23] !== (b[22]===1?111:222)) return fail('Invalid tracker version or flags');
  const u16=i=>b[i]*256+b[i+1];
  const u32=i=>b[i]*16777216+b[i+1]*65536+b[i+2]*256+b[i+3];
  const i32=i=>u32(i)>2147483647?u32(i)-4294967296:u32(i);
  const fix=!!(b[1]&1),alt=!!(b[1]&2),hdop=!!(b[1]&4),battery=!!(b[1]&8);
  if((alt&&!fix)||(!fix&&(u32(6)||u32(10)||u16(14)||b[21]!==255)) ||
      (fix&&(Math.abs(i32(6))>900000000||Math.abs(i32(10))>1800000000||b[21]>=10)) ||
      (!alt&&u16(14))||(!hdop&&u16(17))||(!battery&&u16(19)) ||
      (battery&&(u16(19)<2800||u16(19)>4500))) return fail('Invalid tracker fields');
  const data={version:1,counter:u32(2),gps_fix:fix,satellites:b[16],firmware:b[22],test_value:b[23]};
  if(fix) {data.latitude=i32(6)/1e7;data.longitude=i32(10)/1e7;data.fix_age_s=b[21];}
  if(alt) {const a=u16(14);data.altitude=a>32767?a-65536:a;}
  if(hdop) data.hdop=u16(17)/100;
  if(battery) data.battery_v=u16(19)/1000;
  return {data,warnings:fix?[]:['No fresh GPS fix; no coordinates reported'],errors:[]};
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
