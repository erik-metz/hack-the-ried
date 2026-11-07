function decodeUplink(input) {
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
