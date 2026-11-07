#include "../dummy/transfer.h"
#include <assert.h>
#include <vector>
#include <algorithm>

struct Flash : lab::Storage {
  std::vector<uint8_t> image;
  bool active = false, bootChanged = false, failWrite = false, failApply = false;
  bool baseMatches = true;
  int writes = 0;
  bool begin(size_t n) override { image.assign(n, 0xff); active = true; return true; }
  bool write(size_t offset, const uint8_t* data, size_t n) override {
    if (failWrite || !active || offset+n > image.size()) return false;
    std::copy(data, data+n, image.begin()+offset); ++writes; return true;
  }
  bool verify(const uint8_t*, size_t n) override {
    for (size_t i=0; i<n; ++i) if (image[i] != uint8_t(i)) return false;
    return true;
  }
  bool apply() override { bootChanged = !failApply; active = false; return bootChanged; }
  void abort() override { active = false; }
  bool copyBase(const uint8_t*, size_t n) override {
    if (!baseMatches) return false;
    for (size_t i=0;i<n;++i) image[i]=uint8_t(i);
    image[0]=0x99; // A differs from expected B in one block.
    return true;
  }
};
std::vector<uint8_t> command(uint8_t kind, uint32_t session=123) {
  std::vector<uint8_t> p(5); p[0]=kind; lab::put32(p.data()+1,session); return p;
}
std::vector<uint8_t> start(size_t n) {
  auto p=command(1); p.resize(41); lab::put32(p.data()+5,n); return p;
}
std::vector<uint8_t> block(size_t i, size_t size) {
  auto p=command(2); p.resize(7+size); p[5]=i>>8; p[6]=i;
  for (size_t j=0;j<size;++j) p[j+7]=uint8_t(i*128+j);
  return p;
}
lab::Result send(lab::Transfer& transfer, std::vector<uint8_t> p) {
  return transfer.command(p.data(),p.size());
}
int main() {
  Flash flash; lab::Transfer t(flash);
  assert(send(t,start(257))==lab::Receiving);
  assert(send(t,block(2,1))==lab::Receiving);
  assert(send(t,start(257))==lab::Receiving); // lost ACK does not erase
  assert(flash.writes==1 && t.received==1);
  assert(send(t,block(2,1))==lab::Receiving && flash.writes==1);
  assert(send(t,command(3))==lab::Rejected && !flash.bootChanged);
  assert(send(t,block(1,127))==lab::Rejected);
  auto wrong=block(0,128); lab::put32(wrong.data()+1,124);
  assert(send(t,wrong)==lab::Rejected);
  uint8_t status[30]; assert(t.status(status,t.state)==18);
  assert(status[15]==0 && status[17]==1); // blocks 0 and 1 still missing
  assert(send(t,block(1,128))==lab::Receiving);
  assert(send(t,block(0,128))==lab::Ready);
  assert(send(t,command(3))==lab::Applied && flash.bootChanged);
  assert(send(t,command(4))==lab::Rejected); // cannot undo committed boot
  assert(send(t,start(257))==lab::Rejected); // cannot erase pending boot target
  assert(send(t,command(5))==lab::Applied);
  Flash bad; lab::Transfer corrupt(bad);
  assert(send(corrupt,start(1))==lab::Receiving);
  auto data=block(0,1); data[7]=123;
  assert(send(corrupt,data)==lab::Ready);
  assert(send(corrupt,command(3))==lab::HashError && !bad.bootChanged && !bad.active);
  assert(send(corrupt,start(0))==lab::Rejected);
  assert(send(corrupt,start(lab::MAX_IMAGE+1))==lab::Rejected);
  assert(send(corrupt,start(lab::MAX_IMAGE))==lab::Receiving);
  assert(send(corrupt,block(65535,1))==lab::Rejected);
  bad.failWrite=true;
  assert(send(corrupt,block(0,128))==lab::StorageError && !bad.active);
  assert(send(corrupt,command(4))==lab::Idle);
  assert(send(corrupt,start(1))==lab::Receiving);
  bad.failWrite=false; bad.failApply=true;
  assert(send(corrupt,block(0,1))==lab::Ready);
  assert(send(corrupt,command(3))==lab::StorageError && !bad.bootChanged);
  for (size_t n=0;n<5;++n) {
    std::vector<uint8_t> shortPacket(n);
    assert(send(t,shortPacket)==lab::Rejected);
  }
  Flash copied; lab::Transfer delta(copied);
  auto manifest=start(257);
  manifest[0]=6; manifest.resize(81);
  lab::put32(manifest.data()+41,257); manifest[78]=1; // one changed block, index 0
  assert(send(delta,manifest)==lab::Receiving && delta.received==2);
  assert(send(delta,manifest)==lab::Receiving && delta.received==2);
  assert(send(delta,command(3))==lab::Rejected && !copied.bootChanged);
  assert(send(delta,block(0,128))==lab::Ready);
  assert(send(delta,command(3))==lab::Applied && copied.bootChanged);
  Flash mismatch; lab::Transfer wrongBase(mismatch); mismatch.baseMatches=false;
  assert(send(wrongBase,manifest)==lab::HashError && !mismatch.bootChanged);
  manifest[80]=3; // outside image
  assert(send(wrongBase,manifest)==lab::Rejected);
}
