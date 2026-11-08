#pragma once
#include <RadioLib.h>
// Heltec V4.3 KCT8103L: vendor conversion table gives 13 dB net gain
// at low drive. Limit conducted nominal output to 14 dBm, including MAC changes.
class HeltecRadio:public SX1262 {
 public:
  using SX1262::SX1262;
  int16_t setOutputPower(int8_t nominal) override {
    return SX1262::setOutputPower(constrain(int(nominal)-13,-9,1));
  }
};
static const uint32_t femPins[Module::RFSWITCH_MAX_PINS]={2,5,RADIOLIB_NC,RADIOLIB_NC,RADIOLIB_NC};
static const Module::RfSwitchMode_t femModes[]={
  {Module::MODE_IDLE,{LOW,LOW}},
  {Module::MODE_RX,{HIGH,LOW}},
  {Module::MODE_TX,{HIGH,HIGH}},
  END_OF_MODE_TABLE
};
inline void initBoardPower() {
  pinMode(36,OUTPUT);digitalWrite(36,LOW);
  pinMode(7,OUTPUT);digitalWrite(7,HIGH);
  pinMode(2,OUTPUT);digitalWrite(2,HIGH);
  pinMode(5,OUTPUT);digitalWrite(5,LOW);
  SPI.begin(9,11,10,8);
}
