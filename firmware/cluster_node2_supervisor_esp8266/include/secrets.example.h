// Copy this file to secrets.h (git-ignored) and fill in YOUR network.
// All three cluster nodes and the laptop must join the same Wi-Fi (e.g. your phone hotspot).
#ifndef SECRETS_H
#define SECRETS_H

#define WIFI_SSID "YourHotspotName"     // change: your hotspot / router name
#define WIFI_PASS "YourHotspotPassword" // change: its password (2.4 GHz network)

// change: the laptop's IP on that network (run `ip -4 addr` on Linux, `ipconfig` on Windows).
// If it is wrong the nodes still reach the laptop through broadcast, it is just less direct.
#define HUB_IP IPAddress(192, 168, 43, 100)

#define UDP_PORT 4210

#endif
