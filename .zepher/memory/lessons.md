# Lessons Learned


## [2026-10-24T17:05:37.896Z]
ESP32 flash communication errors (invalid header: 0xffffffff / Manufacturer ff) occur when external SPI/RF modules like NRF24L01 are wired to internal flash pins (CLK/SD0/SD1/CMD) or short the 3.3V power rail. Sentinel operates reliably using native ESP32 Wi-Fi promiscuous sniffing without external RF modules.
