// Normal telemetry remains on TTN; independent private control + MC update path.
#include <Arduino.h>
#include <RadioLib.h>
#include <Preferences.h>
#include "build_config.h"
#include "../dummy/ota_storage.h"
#include "credentials.h"
#include "board.h"
#include "tracker.h"

static volatile const uint8_t firmwareVersion=TEST_FIRMWARE_VERSION;
static volatile const uint16_t testValue=TEST_FIRMWARE_VERSION==1?111:222;
HeltecRadio radio=new Module(8,14,12,13);
LoRaWANBand_t ttnBand=EU868,privateBand=EU868;
LoRaWANNode ttn(&radio,&ttnBand),control(&radio,&privateBand);
Preferences ttnState,controlState,mcState;
Credentials credentials;
OtaStorage storage;
lab::Transfer transfer(storage);
lab::Result lastResult=lab::Idle;
bool ttnJoined=false,controlJoined=false,pendingStatus=false,pendingBootReport=true;
uint8_t ttnFailures=0,controlFailures=0;
int lastTtnResult=0;
uint32_t telemetryCount=0;
bool firstFixSent=false;
uint32_t ttnRetry=0,controlRetry=0,nextTelemetry=0,counter=0,lastMulticast=0,rebootAt=0;

void halt(const char* reason) {
  Serial.println(reason);
  while (true) { credentials.serialCommand(); delay(5); }
}
void persist(LoRaWANNode& node,Preferences& state) {
  if (state.putBytes("nonces",node.getBufferNonces(),RADIOLIB_LORAWAN_NONCES_BUF_SIZE)!=RADIOLIB_LORAWAN_NONCES_BUF_SIZE
      || state.putBytes("session",node.getBufferSession(),RADIOLIB_LORAWAN_SESSION_BUF_SIZE)!=RADIOLIB_LORAWAN_SESSION_BUF_SIZE)
    halt("ERROR: security state write failed; radio halted");
}
void restore(LoRaWANNode& node,Preferences& state) {
  if (!state.isKey("nonces")) return;
  uint8_t nonces[RADIOLIB_LORAWAN_NONCES_BUF_SIZE],session[RADIOLIB_LORAWAN_SESSION_BUF_SIZE];
  if (state.getBytes("nonces",nonces,sizeof(nonces))!=sizeof(nonces) || node.setBufferNonces(nonces)<0)
    halt("ERROR: invalid stored nonces; radio halted");
  if (state.getBytes("session",session,sizeof(session))==sizeof(session)) node.setBufferSession(session);
}
bool activated(int16_t result) {
  return result==RADIOLIB_ERR_NONE || result==RADIOLIB_LORAWAN_NEW_SESSION || result==RADIOLIB_LORAWAN_SESSION_RESTORED;
}
uint32_t quietTime() {
  // Both MAC contexts share one transmitter and one off-air budget.
  return max(ttn.timeUntilUplink(),control.timeUntilUplink());
}
void listenMulticast() {
  if (!controlJoined) return;
  int16_t result=control.startMulticastSession(RADIOLIB_LORAWAN_CLASS_C,credentials.address(),
    credentials.group+4,credentials.group+20,lastMulticast,0xfffffffe,869525000,5);
  if (result<0) halt("ERROR: multicast receive could not be restored");
}
void receiveCommand(const uint8_t* data,size_t size,const LoRaWANEvent_t& event) {
  if (!event.multicast || event.mcGroupId!=0 || event.fPort!=43 || !size) return;
  // Record authenticated frames BEFORE flash commands, including rejects.
  if (!event.fCnt || event.fCnt<=lastMulticast || event.fCnt==0xffffffff) return;
  if (mcState.putULong("last",event.fCnt)!=4) halt("ERROR: multicast counter persistence failed");
  lastMulticast=event.fCnt;
  lastResult=transfer.command(data,size);
  if (data[0]!=2) pendingStatus=true;
  if (lastResult==lab::Applied) rebootAt=millis()+30000;
  Serial.printf("MC command=%u frame=%lu result=%u blocks=%lu/%u\n",data[0],(unsigned long)lastMulticast,
    lastResult,(unsigned long)transfer.received,(unsigned)transfer.blocks());
}
void payload(uint8_t out[8]) {
  out[0]=1;out[1]=firmwareVersion;out[2]=testValue>>8;out[3]=testValue;
  lab::put32(out+4,counter);
}
void setup() {
  const size_t usbBuffer=Serial.setRxBufferSize(512);
  Serial.begin(115200);delay(1500);
  if (usbBuffer<512) halt("ERROR: USB provisioning buffer unavailable");
  Serial.printf("TTN-FUOTA firmware=%u value=%u protocol=lab1 transport=multicast\n",firmwareVersion,testValue);
  while (!credentials.load()) {
    Serial.println("PROFILE missing; CFG3 USB provisioning required");
    for (size_t i=0;i<200;++i) {credentials.serialCommand();delay(5);}
  }
  if (!ttnState.begin(credentials.ttn.securityNamespace) || !controlState.begin(credentials.control.securityNamespace)
      || !mcState.begin(credentials.multicastNamespace)) halt("ERROR: NVS unavailable");
  if (mcState.isKey("last") && mcState.getType("last")!=PT_U32) halt("ERROR: invalid multicast state");
  lastMulticast=mcState.getULong("last",0);
  if (lastMulticast>=0xfffffffe) halt("ERROR: multicast counter exhausted; provision a new group");
  initBoardPower();initTracker();
  if (radio.begin(868.1,125,7,5,0x34,14,8,1.8)!=RADIOLIB_ERR_NONE) halt("ERROR: radio init");
  radio.setDio2AsRfSwitch(true);radio.setRfSwitchTable(femPins,femModes);
  ttnBand.txFreqs[1].freq=0;ttnBand.txFreqs[2].freq=0;
  if (ttn.beginOTAA(credentials.ttn.eui(2),credentials.ttn.eui(10),credentials.ttn.bytes+34,credentials.ttn.bytes+18)<0
      || control.beginOTAA(credentials.control.eui(2),credentials.control.eui(10),credentials.control.bytes+34,credentials.control.bytes+18)<0)
    halt("ERROR: OTAA init");
  restore(ttn,ttnState);restore(control,controlState);
  ttn.setADR(false);control.setADR(true);ttn.setDutyCycle(true);control.setDutyCycle(true);
  ttn.setDatarate(5);control.setDatarate(5);
  Serial.printf("TTN DevEUI=%08lx%08lx update DevEUI=%08lx%08lx mc=%08lx last=%lu\n",
    (unsigned long)(credentials.ttn.eui(10)>>32),(unsigned long)credentials.ttn.eui(10),
    (unsigned long)(credentials.control.eui(10)>>32),(unsigned long)credentials.control.eui(10),
    (unsigned long)credentials.address(),(unsigned long)lastMulticast);
  Serial.printf("OTA running=%s target=%s\n",esp_ota_get_running_partition()->label,esp_ota_get_next_update_partition(nullptr)->label);
}
void loop() {
  credentials.serialCommand();
  tickMinuteSample();
  trackerUi(ttnJoined,controlJoined,telemetryCount,lastTtnResult,firmwareVersion,transfer.received,transfer.blocks());
  uint32_t now=millis();
  if(ttnJoined && !firstFixSent && gpsSample().position) {nextTelemetry=now;firstFixSent=true;}
  if (!ttnJoined && ttnFailures<3 && (int32_t)(now-ttnRetry)>=0 && quietTime()==0) {
    int16_t result=ttn.activateOTAA();persist(ttn,ttnState);ttnJoined=activated(result);
    Serial.printf("TTN JOIN state=%d joined=%u\n",result,ttnJoined);
    if (!ttnJoined) {++ttnFailures;ttnRetry=millis()+60000UL*ttnFailures;}
    listenMulticast();return;
  }
  if (ttnJoined && !rebootAt && (int32_t)(now-nextTelemetry)>=0 && quietTime()==0) {
    uint8_t data[65],down[255];size_t length=sizeof(down);size_t payloadSize=24;LoRaWANEvent_t event={};
    if (firmwareVersion >= 2) {
      payloadSize=tracker::encodeMulti(data,currentMultiSample(),counter,firmwareVersion);
    } else {
      tracker::Sample sample=gpsSample();payloadSize=tracker::encode(data,sample,counter,firmwareVersion);
    }
    int16_t result=ttn.sendReceive(data,payloadSize,44,down,&length,false,nullptr,&event);
    persist(ttn,ttnState);lastTtnResult=result;if(result>=0)++telemetryCount;
    Serial.printf("TTN UPLINK firmware=%u value=%u counter=%lu size=%u state=%d\n",firmwareVersion,testValue,(unsigned long)counter++,payloadSize,result);
    if (result==RADIOLIB_ERR_NETWORK_NOT_JOINED) {ttnJoined=false;ttnFailures=0;}
    nextTelemetry=millis()+300000;listenMulticast();return;
  }
  if (ttnJoined && !controlJoined && controlFailures<3 && (int32_t)(now-controlRetry)>=0 && quietTime()==0) {
    int16_t result=control.activateOTAA();persist(control,controlState);controlJoined=activated(result);
    Serial.printf("UPDATE JOIN state=%d joined=%u; TTN remains active\n",result,controlJoined);
    if (!controlJoined) {++controlFailures;controlRetry=millis()+60000UL*controlFailures;}
    listenMulticast();return;
  }
  if (controlJoined && (pendingStatus || pendingBootReport) && quietTime()==0) {
    uint8_t data[30],down[255];size_t length=sizeof(down);LoRaWANEvent_t event={};
    bool status=pendingStatus;
    size_t size=status?transfer.status(data,lastResult):8;
    if (!status) payload(data);
    int16_t result=control.sendReceive(data,size,status?43:42,down,&length,false,nullptr,&event);
    persist(control,controlState);
    if (result>=0) {if (status) pendingStatus=false;else pendingBootReport=false;}
    Serial.printf("UPDATE feedback port=%u state=%d\n",status?43:42,result);
    if (result==RADIOLIB_ERR_NETWORK_NOT_JOINED) {controlJoined=false;controlFailures=0;}
    listenMulticast();
    if (result>0 && length) receiveCommand(down,length,event);
    if (rebootAt && result>=0 && status) {delay(quietTime()+1000);ESP.restart();}
    return;
  }
  if (rebootAt && (int32_t)(now-rebootAt)>=0 && quietTime()==0) ESP.restart();
  if (controlJoined) {
    uint8_t data[255];size_t size=sizeof(data);LoRaWANEvent_t event={};
    int16_t result=control.getDownlinkClassC(data,&size,&event);
    if (result>0) {persist(control,controlState);receiveCommand(data,size,event);}
  }
  delay(5);
}
