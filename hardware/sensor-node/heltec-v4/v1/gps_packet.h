#pragma once
#include <stdint.h>
#include <stddef.h>
namespace tracker {
struct Sample {
  bool position=false,altitude=false,hdop=false,battery=false;
  int32_t latitude=0,longitude=0;
  int16_t altitudeMetres=0;
  uint16_t hdopHundredths=0,batteryMv=0;
  uint8_t satellites=0,ageSeconds=255;
};
inline void put(uint8_t* out,uint32_t value,size_t size) {
  for(size_t i=0;i<size;++i) out[i]=value>>(8*(size-1-i));
}
inline size_t encode(uint8_t* out,const Sample& s,uint32_t counter,uint8_t firmware) {
  out[0]=1;out[1]=(s.position?1:0)|(s.position&&s.altitude?2:0)|(s.hdop?4:0)|(s.battery?8:0);
  put(out+2,counter,4);put(out+6,s.position?uint32_t(s.latitude):0,4);
  put(out+10,s.position?uint32_t(s.longitude):0,4);
  put(out+14,s.position&&s.altitude?uint16_t(s.altitudeMetres):0,2);
  out[16]=s.satellites;put(out+17,s.hdop?s.hdopHundredths:0,2);
  put(out+19,s.battery?s.batteryMv:0,2);out[21]=s.position?s.ageSeconds:255;
  out[22]=firmware;out[23]=firmware==1?111:222;return 24;
}
}
