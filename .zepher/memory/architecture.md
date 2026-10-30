# Architecture

UNKNOWN

## [2026-10-24T17:05:38.178Z]
Ghost-Spectrum Tri-Node RF resilience architecture: Node 1 Sentinel ESP32 (L2 Wi-Fi sniffer at 921600 baud), Node 2 Mission ESP32 (nominal Wi-Fi + FS1000A 433MHz failover), Node 3 Sub-GHz Gateway Arduino Uno (XY-MK-5V 433MHz RX + relay data channel switch). Edge FastAPI server runs SecOps agent and Mission Control UI on port 8500.

## [2026-10-24] Pivot: Link Doctor
Project reframed from "RF intrusion / air-gap relay" to a self-diagnosing IoT link: Node A ESP32 (real Wi-Fi to phone hotspot, LDR sensor, link metrics, reflex fallback, store-and-forward, FS1000A TX), Node B Uno (433 RX -> JSON over USB, relay = fallback indicator), Node C ESP32 sentinel without NRF24 (optional channel traffic/deauth counter). Laptop hub server/app.py merges Wi-Fi (UDP 4210) and radio paths by seq, counts lost readings, runs server/brain.py (RandomForest from tools/train.py or rule fallback + agent with pre-emptive make-before-break switching). Agent is offline by design: an internet LLM would fail exactly when the hotspot dies.

## [2026-10-29] Phase 1 Hardware Firmware & ESP8266 Port:
- Node A: ESP32 development board (FS1000A 433MHz TX DATA on GPIO 17 powered from 5V/VIN; IR sensor AO on GPIO 34 ADC1; active buzzer on GPIO 25; momentary pushbutton on GPIO 27 with INPUT_PULLUP; RadioHead unused pins 35/33). Explicit state machine with MANUAL_BUTTON, WIFI_LOST, ACK_TIMEOUT, REMOTE_COMMAND, and RECOVERED reasons. Store-and-forward for unacked packets. Telemetry sent via UDP in Wi-Fi mode and 433 MHz in radio mode (no duplicate telemetry on UDP in radio mode). UDP commands {"cmd":"radio"}, {"cmd":"wifi"}, and {"cmd":"rate"} implemented with diagnostic status responses.
- Node B: Ported to ESP8266 development board (`firmware/gateway_node_esp8266`). XY-MK-5V receiver DATA on D5 (GPIO 14) powered at 3V3 for safe logic levels. SSD1306 I2C OLED on D2 (GPIO 4 SDA) and D1 (GPIO 5 SCL). RadioHead dummy pins on D6 (GPIO 12) & D7 (GPIO 13). Critical bug fixed: validates length == 16 before accessing frame bytes. Validates magic (0xA5), version (0x02), type (0x0A), and CRC16-CCITT. Tracks duplicates with 32-entry circular buffer. Connects to Wi-Fi and forwards validated telemetry over UDP (port 4210) and USB Serial. Non-blocking OLED status display and periodic gateway heartbeat ({"hb":1}).
- Shared Protocol: Defined in `firmware/common/radio_protocol.h` and verified via host C++ and Python unit tests.

## [2026-10-30] Phase 2: Autonomous Tri-Node Wi-Fi Cluster, Tactical Sentinel & Voice HUD
- Node 1 (ESP8266): Optical Proximity & Adaptive Sensing. Features 3-stage dynamic LED bargraph (D7, D6, D5), ambient optical baseline auto-calibration (`recalibrate_baseline()`), and UDP remote command processor (`{"cmd":"zero"}`).
- Node 2 (ESP8266): Telemetry Supervisor & Active Audio Alert. Drives SSD1306 OLED (D1=SCL, D2=SDA), multi-tone PWM buzzer (D6) for alarm warbles and test chimes, and tactile ACK button (D5).
- Node 3 (ESP32): Cyber Sentinel & Spectrum Guard. Operates in 3 tactical modes: `MODE_SPECTRUM_SWEEPER` (channels 1-13 hop), `MODE_TRAFFIC_MONITOR` (beacon density/rogue check), and `MODE_SYNTHETIC_JAMMER`. Short button click toggles modes; long press (>1.2s) fires 5-second synthetic deauth/jamming burst. Dual-LED visual signaling (GPIO 2 & GPIO 4).
- Edge Hub (`server/app.py` & `server/agent_orchestrator.py`): Bidirectional UDP 4210 message router and command dispatcher (`POST /api/chat/command`), serving FastAPI WebSocket and HTTP endpoints on port 8500. Dual AI engine:
  - AWS Bedrock: Cloud reasoning powered by Amazon Nova Lite (`apac.amazon.nova-lite-v1:0` in `ap-south-1`) with native tool-calling (`trigger_buzzer`, `simulate_threat`, `rearm_cluster`, `zero_optical_sensor`, `set_telemetry_rate`).
  - Local JEV: Joint Edge Validator executing on-device sub-millisecond (< 0.1ms) deterministic tool-calls and link decisions.
- 3D Mission Control (`frontend/`): Multi-node animated particle links (Cyan Node 1, Emerald Node 2, Crimson Node 3), 60 FPS carrier spectrum analyzer (`SensorWaveform.tsx`), decoupled network RTT timeline (`Timeline.tsx`), and dual-engine Voice & Chat drawer (`VoiceChatConsole.tsx`).

