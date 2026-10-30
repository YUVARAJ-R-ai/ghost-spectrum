# Self-Healing Distributed IoT Cluster & Autonomous Cyber Sentinel

An enterprise-grade, edge-AI resilient IoT cluster that monitors physical optical perimeters, autonomously detects wireless cyber interference (deauthentication floods & channel jamming), and provides real-time 3D visualization with interactive voice & chat command orchestration.

---

## 1. System Architecture

The cluster comprises **three physical hardware nodes** interconnected over high-speed Wi-Fi UDP, coordinated by an **Edge-AI Gateway** and monitored through a **3D WebGL Dashboard**:

```
                              ┌───────────────────────────────────┐
                              │     Wi-Fi Access Point (AP)       │
                              │       Channel 1–13 / 2.4 GHz      │
                              └─────────────────┬─────────────────┘
                                                │
           ┌────────────────────────────────────┼────────────────────────────────────┐
           ▼                                    ▼                                    ▼
┌───────────────────────┐            ┌───────────────────────┐            ┌───────────────────────┐
│     NODE 1: SENSOR    │            │  NODE 2: SUPERVISOR   │            │   NODE 3: SENTINEL    │
│  ESP8266 · 80 MHz     │            │  ESP8266 · 80 MHz     │            │  ESP32 · Dual-Core    │
│  • Analog IR on A0    │            │  • OLED Display #2    │            │  • Mode Switch (IO27) │
│  • OLED Display #1    │            │  • Active Buzzer (D6) │            │  • Blue LED (IO2)     │
│  • Multi-LED Bar (D7) │            │  • Alert Button (D5)  │            │  • Channel Sweeper    │
│  • Auto-Calibration   │            │  • Threat Chirp Alarm │            │  • Deauth Simulator   │
└──────────┬────────────┘            └──────────┬────────────┘            └──────────┬────────────┘
           │ UDP 4210                           │ UDP 4210                           │ UDP 4210
           └────────────────────────────────────┼────────────────────────────────────┘
                                                │
                                                ▼
                              ┌───────────────────────────────────┐
                              │     LAPTOP EDGE-AI GATEWAY        │
                              │  FastAPI · Scikit-Learn · UDP     │
                              │  • Real-time Telemetry Ingestion  │
                              │  • Autonomic Threat Diagnoser     │
                              │  • Natural Language Voice/Chat    │
                              │  • WebSocket Broadcaster (8500)   │
                              └─────────────────┬─────────────────┘
                                                │
                                                ▼
                              ┌───────────────────────────────────┐
                              │  3D REACT THREE FIBER DASHBOARD   │
                              │  • 3-Node Synchronized Link Arcs  │
                              │  • 60 FPS Optical Oscilloscope    │
                              │  • Voice & Terminal HUD Console   │
                              │  • Latency & Event Ledger Stream  │
                              └───────────────────────────────────┘
```

---

## 2. Hardware Nodes & Pinout Guide

### Node 1: Optical Perimeter Sensor
* **Microcontroller**: NodeMCU ESP8266 (ESP-12E)
* **Firmware Location**: `firmware/cluster_node1_sensor_esp8266/`

| Component | Pin | ESP8266 NodeMCU Pin |
| :--- | :--- | :--- |
| **Analog IR Proximity Sensor** | VCC / GND / AO | 3V3 / GND / **A0 (ADC0)** |
| **SSD1306 0.96" OLED #1** | VCC / GND / SDA / SCL | 3V3 / GND / **D2 (GPIO 4)** / **D1 (GPIO 5)** |
| **Proximity Indicator LED** | Anode (+) / Cathode (-) | **D7 (GPIO 13)** via 220Ω / GND |
| **Onboard Status LED** | Internal | **GPIO 2** (Active LOW) |

### Node 2: Cluster Supervisor & Acoustic Alarm
* **Microcontroller**: NodeMCU ESP8266 (ESP-12E)
* **Firmware Location**: `firmware/cluster_node2_supervisor_esp8266/`

| Component | Pin | ESP8266 NodeMCU Pin |
| :--- | :--- | :--- |
| **Active 5V/3.3V Buzzer** | (+) / (-) | **D6 (GPIO 12)** / GND |
| **Tactile Alert Switch** | Pin 1 / Pin 2 | **D5 (GPIO 14)** / GND (Internal PULLUP) |
| **SSD1306 0.96" OLED #2** | VCC / GND / SDA / SCL | 3V3 / GND / **D2 (GPIO 4)** / **D1 (GPIO 5)** |
| **Status Indicator LED** | Internal | **GPIO 2** (Active LOW) |

### Node 3: Dual-Core Cyber Sentinel & Spectrum Monitor
* **Microcontroller**: ESP32 DevKit V1 (Xtensa 240 MHz)
* **Firmware Location**: `firmware/cluster_node3_sentinel_esp32/`

| Component | Pin | ESP32 Pin |
| :--- | :--- | :--- |
| **Tactical Mode Button** | Pin 1 / Pin 2 | **GPIO 27** / GND (Internal PULLUP) |
| **Onboard Blue Activity LED** | Internal | **GPIO 2** |
| **Auxiliary Threat LED** | Anode (+) / Cathode (-) | **GPIO 4** via 220Ω / GND |

* **Button Controls**:
  * **Short Click (< 1.0s)**: Cycles mode between `SPECTRUM_SWEEPER` (channels 1–13), `TRAFFIC_MONITOR`, and `SYNTHETIC_JAMMER`.
  * **Long Press (≥ 1.0s)**: Immediately triggers a 5-second burst of 145 deauth frames/sec anomaly simulation.

---

## 3. Quickstart & Execution

### 1. Launch the Gateway & Dashboard
The system runs natively on NixOS or Linux:

```bash
# 1. Enter the Nix shell environment
nix-shell

# 2. Start the backend hub (listening on UDP 4210 and serving dashboard on HTTP 8500)
python3 server/app.py
```
Open **[http://localhost:8500](http://localhost:8500)** in your browser.

### 2. Flashing the Firmware
Plug in each node via USB and flash using PlatformIO:

```bash
# Node 1 (Sensor)
pio run -d firmware/cluster_node1_sensor_esp8266 -t upload

# Node 2 (Supervisor)
pio run -d firmware/cluster_node2_supervisor_esp8266 -t upload

# Node 3 (Sentinel)
pio run -d firmware/cluster_node3_sentinel_esp32 -t upload
```

---

## 4. Key Capabilities & Features

### 🎙️ Dual-Engine Voice & Chat AI Console (AWS Bedrock + Local JEV)
Click the **Bedrock & JEV Voice** HUD button at the bottom-right of the dashboard or speak via microphone. Supports dynamic engine switching:
* **☁️ AWS Bedrock Engine**: Leverages Amazon Nova Lite (`apac.amazon.nova-lite-v1:0` in `ap-south-1` via configured AWS CLI) with native tool-calling capabilities to reason, query cluster status, and execute multi-step cyber operations.
* **⚡ Local JEV Engine**: Joint Edge Validator executing on-device sub-millisecond (< 0.1ms) deterministic tool-calls and link decisions with 100% offline air-gap reliability.
* **Auto Mode**: Intelligently routes high-speed tactical actions to JEV (< 1ms) and deep conversational inquiries to AWS Bedrock.

**Supported Tactical Voice & Chat Commands:**
* *"Simulate jamming attack"* → Injects 142 deauth frames/sec into Sentinel stream; flags threat alert.
* *"Clear all alerts and rearm"* → Resets threat flags across the cluster; restores nominal green status.
* *"Test supervisor buzzer"* → Pulses Node 2 acoustic buzzer alarm.
* *"Calibrate optical sensor"* → Re-zeroes ambient optical baseline on Node 1.
* *"Set rate to 250ms"* → Increases telemetry rate to high-speed 4 Hz stream.
* *"Cluster status report"* → Reads out active node count, latency, and mesh health via Speech Synthesis.

### 🌐 3-Node Synchronized 3D Stage
* **Node 1 Link (Cyan)**: Real-time particle arc pulsing on sensor telemetry.
* **Node 2 Link (Emerald)**: Glowing link pulsing on supervisory heartbeat.
* **Node 3 Link (Violet/Red)**: Violet monitoring beam that erupts into pulsing crimson shockwaves during jamming attacks.

### 📈 Decoupled Telemetry & 60 FPS Optical Radar
* **Network Health**: Main timeline chart graphs true **Ping/RTT Latency (ms)**, packet loss %, and RSSI without confusing sensor spikes.
* **Optical Proximity Radar**: A dedicated 60 FPS canvas visualizes carrier modulation and flips to pulsing hazard red when proximity is detected.

---

## 5. Verification & Testing

Run the automated test suites:

```bash
# 1. Hub protocol and message routing checks
python3 -m unittest discover tests

# 2. Frontend typecheck and production build
cd frontend && npm run build
```
