#pragma once
#include <TinyGPS++.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include "gps_packet.h"
Adafruit_SSD1306 display(128,64,&Wire,21);
HardwareSerial gpsUart(1);
TinyGPSPlus gps;
SemaphoreHandle_t gpsLock;
bool displayReady=false;
uint32_t gpsBytes=0,gpsSentences=0;
uint8_t gpsConfig=0;
const int gpsRx[]={39,38,39,38};
const int gpsTx[]={38,39,38,39};
const uint32_t gpsBaud[]={9600,9600,115200,115200};
void gpsTask(void*) {
  uint32_t probe=millis();
  while(true) {
    xSemaphoreTake(gpsLock,portMAX_DELAY);
    while(gpsUart.available()) {++gpsBytes;if(gps.encode(char(gpsUart.read()))) ++gpsSentences;}
    // Only change UART settings when no valid NMEA has ever arrived.
    // A receiver acquiring satellites must be left alone.
    if(!gpsSentences && millis()-probe>20000) {
      gpsConfig=(gpsConfig+1)%4;gpsUart.end();gps=TinyGPSPlus();
      gpsUart.begin(gpsBaud[gpsConfig],SERIAL_8N1,gpsRx[gpsConfig],gpsTx[gpsConfig]);probe=millis();
    }
    xSemaphoreGive(gpsLock);vTaskDelay(pdMS_TO_TICKS(10));
  }
}
void initTracker() {
  pinMode(21,OUTPUT);digitalWrite(21,LOW);delay(20);digitalWrite(21,HIGH);delay(50);
  Wire.begin(17,18);displayReady=display.begin(SSD1306_SWITCHCAPVCC,0x3c);
  if(displayReady) {display.clearDisplay();display.setTextColor(SSD1306_WHITE);display.setTextSize(1);display.setCursor(0,0);display.println("Heltec TTN GPS");display.display();}
  pinMode(34,OUTPUT);digitalWrite(34,LOW);pinMode(40,OUTPUT);digitalWrite(40,HIGH);
  pinMode(42,OUTPUT);digitalWrite(42,LOW);delay(150);digitalWrite(42,HIGH);
  gpsUart.setRxBufferSize(4096);gpsUart.begin(9600,SERIAL_8N1,39,38);
  gpsLock=xSemaphoreCreateMutex();if(!gpsLock) {Serial.println("GPS task lock failed");return;}
  if(xTaskCreate(gpsTask,"gps",4096,nullptr,1,nullptr)!=pdPASS) Serial.println("GPS task start failed");
  pinMode(37,OUTPUT);digitalWrite(37,HIGH);analogReadResolution(12);analogSetPinAttenuation(1,ADC_2_5db);
  pinMode(0,INPUT_PULLUP);
  Serial.printf("DISPLAY ready=%u\n",displayReady);
}
tracker::Sample gpsSample() {
  tracker::Sample s;
  if(gpsLock) {
    xSemaphoreTake(gpsLock,portMAX_DELAY);
    s.position=gps.location.isValid()&&gps.location.age()<10000;
    if(s.position) {s.latitude=lround(gps.location.lat()*1e7);s.longitude=lround(gps.location.lng()*1e7);s.ageSeconds=gps.location.age()/1000;}
    s.altitude=gps.altitude.isValid()&&gps.altitude.age()<10000;
    if(s.altitude) s.altitudeMetres=constrain(lround(gps.altitude.meters()),-32768L,32767L);
    s.hdop=gps.hdop.isValid()&&gps.hdop.age()<10000;
    if(s.hdop) s.hdopHundredths=min(uint32_t(65535),uint32_t(gps.hdop.value()));
    s.satellites=gps.satellites.isValid()?min(uint32_t(255),uint32_t(gps.satellites.value())):0;
    xSemaphoreGive(gpsLock);
  }
  uint32_t mv=lround(analogReadMilliVolts(1)*4.9*1.045);
  s.battery=mv>=2800&&mv<=4500;s.batteryMv=s.battery?mv:0;return s;
}
void trackerUi(bool joined,bool updateJoined,uint32_t sent,int result,uint8_t version,unsigned received,unsigned total) {
  static uint32_t last=0,log=0;if(millis()-last<1000)return;last=millis();
  tracker::Sample s=gpsSample();
  if(displayReady) {
    display.clearDisplay();display.setCursor(0,0);display.printf("Heltec GPS v%u\n",version);
    display.printf("TTN:%s TX:%lu\n",joined?"joined":"joining",(unsigned long)sent);
    display.printf("GPS:%s SAT:%u\n",s.position?"FIX":"no fix",s.satellites);
    if(s.position) {display.printf("%.5f\n",s.latitude/1e7);display.printf("%.5f\n",s.longitude/1e7);}
    else {display.println("Waiting for GPS");display.println("No coordinates sent");}
    if(s.battery) display.printf("BAT:%.2fV ",s.batteryMv/1000.0);
    display.printf("TX:%d\n",result);
    display.printf("OTA:%s %u/%u",updateJoined?"ready":"joining",received,total);display.display();
  }
  if(millis()-log>=10000) {
    log=millis();uint32_t bytes=0,sentences=0;uint8_t config=0;
    if(gpsLock) {xSemaphoreTake(gpsLock,portMAX_DELAY);bytes=gpsBytes;sentences=gpsSentences;config=gpsConfig;xSemaphoreGive(gpsLock);}
    Serial.printf("GPS bytes=%lu NMEA=%lu sats=%u fix=%u RX=%d baud=%lu\n",(unsigned long)bytes,(unsigned long)sentences,s.satellites,s.position,gpsRx[config],(unsigned long)gpsBaud[config]);
  }
}
