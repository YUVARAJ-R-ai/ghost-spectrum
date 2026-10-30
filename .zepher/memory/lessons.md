# Lessons Learned


## [2026-10-24T17:05:37.896Z]
ESP32 flash communication errors (invalid header: 0xffffffff / Manufacturer ff) occur when external SPI/RF modules like NRF24L01 are wired to internal flash pins (CLK/SD0/SD1/CMD) or short the 3.3V power rail. Sentinel operates reliably using native ESP32 Wi-Fi promiscuous sniffing without external RF modules.

## [2026-10-24] Link Doctor rebuild
- RadioHead RH_ASK pttPin must never be 0: it is driven as an OUTPUT. On the Uno that kills Serial RX (pin 0); on ESP32 it is the boot strapping pin. Gateway uses ptt 10, Node A uses 33.
- ESP32 analog sensors must use ADC1 pins (32-39) while Wi-Fi is on; ADC2 is unavailable.
- NixOS firewall blocks Node A's UDP 4210 by default: `sudo iptables -I nixos-fw 1 -p udp --dport 4210 -j nixos-fw-accept`.
- A metal tin around Node A blocks 433 MHz too; for the "fading" demo put the phone hotspot in the tin instead.
- Hard Wi-Fi loss takes the ESP32 seconds to notice; readings sent meanwhile vanish unless unacked readings are resent over radio (store-and-forward, now in Node A).
- Dual-key event logging (`kind`/`type`, `detail`/`msg`) between Python FastAPI and TypeScript UI prevents silent rendering drops in real-time event tables.
- Decoupling network latency (RTT ms) from raw analog sensor voltage prevents misleading timeline spikes; optical proximity belongs in a dedicated high-refresh carrier spectrum analyzer.
- Native browser Web Speech API (STT & TTS) enables fully offline cyber voice control without third-party API dependencies or keys.
