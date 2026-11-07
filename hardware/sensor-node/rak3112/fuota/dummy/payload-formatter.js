function decodeUplink(input) {
  var b = input.bytes;
  if (input.fPort !== 42 || b.length !== 8 || b[0] !== 1) {
    return {errors: ['Expected FUOTA lab format 1: port 42, 8 bytes']};
  }
  return {data: {
    test_firmware: b[1],
    test_value: b[2] * 256 + b[3],
    counter: b[4] * 16777216 + b[5] * 65536 + b[6] * 256 + b[7]
  }};
}
