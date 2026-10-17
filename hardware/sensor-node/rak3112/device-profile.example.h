#pragma once

#include <stdint.h>

// Copy to ~/.config/kamue-digital-lora/rak3112/<ttn-device-id>.h and fill
// using that device's TTN OTAA settings. Never commit real credentials.
static constexpr char joinEUIHex[] = "0000000000000000";
static constexpr char devEUIHex[] = "0000000000000000";
static constexpr char appKeyHex[] = "00000000000000000000000000000000";
static constexpr char nwkKeyHex[] = "00000000000000000000000000000000";
