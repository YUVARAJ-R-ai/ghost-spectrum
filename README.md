# GHOST-SPECTRUM // Autonomous RF Intrusion Detection & Sub-GHz Air-Gap Resilience Framework

An Edge-AI Driven Cyber-Physical Radio Resilience Architecture with Hardware-in-the-Loop (HIL) Air-Gap Isolation.

---

## 1. System Architecture Overview

Ghost-Spectrum provides deterministic Layer-1/2 wireless threat detection and autonomous physical mitigation for edge computing infrastructure. It resolves the classic "connection-starvation loop" caused by 802.11 de-authentication floods and 2.4 GHz RF carrier jamming by deploying a distributed tri-node hardware-in-the-loop (HIL) system:

```
                      +---------------------------------------+
                      |       EDGE SECOPS REASONING AGENT     |
                      |  - Shannon Spectral Entropy Engine    |
                      |  - Sliding-Window Velocity Detector   |
                      |  - Cryptographic Incident Logger      |
                      +-------------------+-------------------+
                                          | WebSocket / JSON
                                          v
+------------------------+      +-------------------+      +-------------------------+
|     NODE 1: SENTINEL   |      |  MISSION CONTROL  |      |   NODE 2: MISSION NODE  |
| ESP32 #1 + NRF24L01+   |      |   WEB DASHBOARD   |      | ESP32 #2 + OLED + FS1000|
| - 802.11 Frame Filter  |----->|  - 125-Ch Heatmap |<-----| - Nominal 2.4GHz Uplink |
| - 125-Ch Carrier Sweep |      |  - CoT Reasoning  |      | - 433MHz Failover Burst |
+------------------------+      |  - Relay Twin     |      +------------+------------+
                                +-------------------+                   |
                                                                        | 433 MHz RF
                                                                        | (RadioHead ASK)
                                                                        v
                                                           +-------------------------+
                                                           |   NODE 3: SUB-GHZ GATEWAY  |
                                                           |  Arduino Uno + XY-MK-5V |
                                                           |  + 5V Mechanical Relay  |
                                                           |  - 10ms Galvanic Cutoff |
                                                           +-------------------------+
```

---

## 2. Hardware Bill of Materials (BOM)

| Subsystem Node | Component | Hardware Role | Interface / Bus | Operating Voltage |
| :--- | :--- | :--- | :--- | :--- |
| **Node 1: Sentinel** | ESP32 DevKit V1 (Type-C / Micro-USB) | Promiscuous 802.11 L2 sniffer & serial pipeline | USB Serial (921600 baud) | 5V USB (3.3V Logic) |
| **Node 1: Sentinel** | NRF24L01+ 2.4GHz Transceiver | Sweeps 125 RF channels, reads RPD register | Hardware VSPI (Pins 4, 5, 18, 19, 23) | **3.3V ONLY** (Do NOT connect to 5V) |
| **Node 2: Mission Node** | ESP32 DevKit V1 | Mission telemetry node & OOB transmitter | Wi-Fi STA + Hardware I2C + GPIO | 5V USB (3.3V Logic) |
| **Node 2: Mission Node** | 0.96" SSD1306 OLED (I2C) | Local link health & attack warning display | Hardware I2C (SCL: 22, SDA: 21) | 3.3V or 5V VCC |
| **Node 2: Mission Node** | FS1000A 433MHz TX Module | Transmits authenticated Sub-GHz failover packets | 1-Wire GPIO (Pin 17) via RadioHead | 5V VIN (for max RF power) |
| **Node 3: Sub-GHz Telemetry Gateway** | Arduino Uno R3 (ATmega328P) | Air-gapped failover receiver & relay actuator | Digital Pin 11 (RX) + Pin 7 (Relay) | 5V Regulated USB / DC |
| **Node 3: Sub-GHz Telemetry Gateway** | XY-MK-5V 433MHz RX Module | Receives 433MHz ASK failover burst packets | Digital Pin 11 (RH_ASK interrupt) | 5V VCC |
| **Node 3: Sub-GHz Telemetry Gateway** | 5V 1-Channel Relay Module | Hardware Data Channel Multiplexer / Link Failover Switch | Digital Pin 7 (IN) | 5V VCC |

---

## 3. Complete Pin-by-Pin Wiring Specifications

### 3.1 Node 1: Spectrum Sentinel (ESP32 #1 + NRF24L01+)
> [!CAUTION]
> The NRF24L01+ VCC **MUST** be connected to the ESP32 **3.3V** pin. Connecting to 5V (VIN) will destroy the NRF24 RF chip.

| NRF24L01+ Pin | ESP32 Pin | Wire Color Recommendation | Function |
| :--- | :--- | :--- | :--- |
| **VCC** | **3V3** (Pin 3.3V) | Red | 3.3V Regulated Power Rail |
| **GND** | **GND** | Black | System Common Ground |
| **CE** | **GPIO 4** | Orange | Chip Enable (Active HIGH for RX) |
| **CSN** | **GPIO 5** | Yellow | SPI Chip Select (Active LOW) |
| **SCK** | **GPIO 18** | Green | VSPI Clock line |
| **MOSI** | **GPIO 23** | Blue | VSPI Master-Out-Slave-In |
| **MISO** | **GPIO 19** | Purple | VSPI Master-In-Slave-Out |

---

### 3.2 Node 2: Mission Telemetry Node (ESP32 #2 + OLED + FS1000A TX)
| Peripheral | Peripheral Pin | ESP32 Pin | Function |
| :--- | :--- | :--- | :--- |
| **OLED (SSD1306)** | VCC | **3V3** or **VIN** | Display Power (3.3V / 5V) |
| **OLED (SSD1306)** | GND | **GND** | Ground |
| **OLED (SSD1306)** | SCL | **GPIO 22** | I2C Clock line |
| **OLED (SSD1306)** | SDA | **GPIO 21** | I2C Data line |
| **FS1000A 433MHz TX**| VCC | **VIN (5V)** | 5V Supply (gives full TX range) |
| **FS1000A 433MHz TX**| GND | **GND** | Ground |
| **FS1000A 433MHz TX**| DATA | **GPIO 17** | RadioHead ASK Modulation line |
| **FS1000A 433MHz TX**| ANT | 17.3 cm wire | Quarter-wave whip antenna |

---

### 3.3 Node 3: Air-Gap Subsystem (Arduino Uno + XY-MK-5V RX + 5V Relay)
| Peripheral | Peripheral Pin | Arduino Uno Pin | Function |
| :--- | :--- | :--- | :--- |
| **XY-MK-5V 433MHz RX**| VCC | **5V** | 5V Regulated Supply |
| **XY-MK-5V 433MHz RX**| GND | **GND** | Ground |
| **XY-MK-5V 433MHz RX**| DATA | **Digital Pin 11** | RadioHead ASK Input pin |
| **5V Relay Module** | VCC | **5V** | Relay Board Logic & Coil Supply |
| **5V Relay Module** | GND | **GND** | Ground |
| **5V Relay Module** | IN | **Digital Pin 7** | Relay Coil Trigger (Active HIGH) |
| **Protected Circuit** | Line In / Out | **COM & NC** | Normally Closed path (Trips Open upon Attack) |

---

## 4. 1-Hour Rapid Deployment Plan

```
+----------------------------------------------------------------------------------+
| [00:00 - 00:15] MILESTONE 1: PHYSICAL WIRING                                     |
|  - Wire Node 1 (ESP32 #1 to NRF24L01 via VSPI).                                  |
|  - Wire Node 2 (ESP32 #2 to OLED via I2C and FS1000A to GPIO 17).                |
|  - Wire Node 3 (Arduino Uno to 433MHz RX on Pin 11 and Relay on Pin 7).          |
+----------------------------------------------------------------------------------+
| [00:15 - 00:30] MILESTONE 2: FIRMWARE FLASHING                                   |
|  - Enter nix-shell: `nix-shell`                                                  |
|  - Flash Node 1: `pio run -d firmware/sentinel_esp32 -t upload`                  |
|  - Flash Node 2: `pio run -d firmware/mission_node_esp32 -t upload`              |
|  - Flash Node 3: `pio run -d firmware/airgap_node_arduino -t upload`              |
+----------------------------------------------------------------------------------+
| [00:30 - 00:45] MILESTONE 3: AGENT PIPELINE & DASHBOARD START                    |
|  - Run verification test: `python3 tools/test_hil_pipeline.py`                   |
|  - Launch FastAPI Server: `python3 server/app.py`                                |
|  - Open Web Dashboard: `http://localhost:8500`                                   |
+----------------------------------------------------------------------------------+
| [00:45 - 01:00] MILESTONE 4: FULL EVALUATION & ATTACK SNAP DEMO                  |
|  - Verify 125-channel waterfall heatmap and live OLED readout.                   |
|  - Click "Benign Bluetooth" -> Verify Agent logs "Alarms Suppressed".            |
|  - Click "802.11 Deauth Flood" -> Audible relay SNAP + OLED switches to ALERT!  |
|  - Inspect generated forensic JSON report in `server/incidents/`.                |
+----------------------------------------------------------------------------------+
```

---

## 5. Firmware Flashing Commands

### Using PlatformIO (Inside `nix-shell`):
```bash
# 1. Start development shell
nix-shell

# 2. Flash Node 1 (Sentinel Promiscuous Sniffer)
pio run -d firmware/sentinel_esp32 -t upload --upload-port /dev/ttyUSB0

# 3. Flash Node 2 (Mission Telemetry & OLED)
pio run -d firmware/mission_node_esp32 -t upload --upload-port /dev/ttyUSB1

# 4. Flash Node 3 (Arduino Uno Air-Gap Relay)
pio run -d firmware/airgap_node_arduino -t upload --upload-port /dev/ttyACM0
```

---

## 6. Running Mission Control & Attack Simulation

### Start the Edge Server:
```bash
nix-shell --run "python3 server/app.py"
```
The server will automatically bind to `http://localhost:8500`. If hardware nodes are connected, it streams high-speed serial telemetry at 921600 baud. If hardware nodes are still on your desk or pending USB plugging, it seamlessly engages the built-in Hardware-in-the-Loop (HIL) simulator!

### Triggering Attacks via CLI:
```bash
# Test Benign 2.4 GHz Congestion (Bluetooth / Microwave):
python3 tools/simulate_attack.py benign

# Trigger Layer-2 802.11 Deauth Flood (>200 fps):
python3 tools/simulate_attack.py deauth

# Trigger Layer-1 Physical RF Carrier Jamming:
python3 tools/simulate_attack.py jamming

# Reset system back to nominal:
python3 tools/simulate_attack.py reset
```

---

## 7. Tamper-Evident Forensic Incident Reports

When an adversarial attack is mitigated, the agent automatically signs and emits a cryptographic SHA-256 post-mortem record saved under `server/incidents/`:

```json
{
  "incident_id": "INC-1776618360-A4B92C",
  "timestamp_iso": "2026-10-19T17:06:00Z",
  "attack_classification": "LAYER-2 DEAUTH / DISASSOC FLOOD ATTACK",
  "metrics": {
    "deauth_velocity_fps": 275.0,
    "shannon_spectral_entropy": 0.3821,
    "target_bssid": "34:85:18:A2:B4:90",
    "unique_source_mac_count": 1,
    "mitigation_latency_ms": 14.2
  },
  "mitigation_actions": [
    "Triggered Sub-GHz (433 MHz) Out-of-Band Failover",
    "Mechanically Tripped Hardware-in-the-Loop Air-Gap Relay (Pin 7)",
    "Dispatched Local OLED Alert [AIR-GAP ENGAGED]"
  ],
  "sha256_hash": "01f044b1a4b89d7c38719ec2070868fdb622df1fa8d38ee59dae75dbfa4f1efb"
}
```
