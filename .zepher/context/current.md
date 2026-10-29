# Current Context for kinesis

## Project Overview
# Project Facts

Framework: UNKNOWN
Database: UNKNOWN

## Architecture Notes
# Architecture

UNKNOWN

## [2026-10-24T17:05:38.178Z]
Ghost-Spectrum Tri-Node RF resilience architecture: Node 1 Sentinel ESP32 (L2 Wi-Fi sniffer at 921600 baud), Node 2 Mission ESP32 (nominal Wi-Fi + FS1000A 433MHz failover), Node 3 Sub-GHz Gateway Arduino Uno (XY-MK-5V 433MHz RX + relay data channel switch). Edge FastAPI server runs SecOps agent and Mission Control UI on port 8500.

## [2026-10-24] Pivot: Link Doctor
Project reframed from "RF intrusion / air-gap relay" to a self-diagnosing IoT link: Node A ESP32 (real Wi-Fi to phone hotspot, LDR sensor, link metrics, reflex fallback, store-and-forward, FS1000A TX), Node B Uno (433 RX -> JSON over USB, relay = fallback indicator), Node C ESP32 sentinel without NRF24 (optional channel traffic/deauth counter). Laptop hub server/app.py merges Wi-Fi (UDP 4210) and radio paths by seq, counts lost readings, runs server/brain.py (RandomForest from tools/train.py or rule fallback + agent with pre-emptive make-before-break switching). Agent is offline by design: an internet LLM would fail exactly when the hotspot dies.

## Constraints
# Constraints

## Conventions
# Conventions

## [2026-10-29T06:15:00.000Z] Phase 2 Completed: Dashboard, Software Integration & 3D Visualization
Delivered laptop-side backend ingestion and authoritative state machine in `server/app.py`, 3D interactive visualization with ESP8266 SSD1306 OLED display and ESP32 GPIO 27 manual override in `frontend/src/scene/`, interactive `ControlPanel.tsx`, and 10 deterministic scenarios in `frontend/src/lib/sim.ts`. Built and verified frontend in `web/dist` and verified test suite in `tests/test_hub_phase2.py`.

## Constraints
# Constraints
- Strict port 4210 for incoming Wi-Fi UDP (Node A `n:"A"` and Node B `n:"B"` forwarded 433MHz frames).
- Port 8500 (or $PORT) for FastAPI and WebSocket `/ws`.
- Commands ride Wi-Fi; reject as unreachable when Node A Wi-Fi is disconnected.
- Distinguish LIVE / HARDWARE vs DEMO / SIMULATED modes unambiguously.

## Conventions
# Conventions

## [2026-10-29T18:00:00.000Z] Emergency Cluster Architecture Pivot & Completion
Pivoted from failing 433 MHz RF ASK modules (caused by 3.3V rail voltage drops) to an all-Wi-Fi Distributed Self-Healing IoT Cluster:
- `firmware/cluster_node1_sensor_esp8266`: Primary sensor node with SSD1306 OLED #1 and analog IR sensor on A0. Built with PlatformIO.
- `firmware/cluster_node2_supervisor_esp8266`: Cluster supervisor node with SSD1306 OLED #2, active buzzer on D6, and alert button on D5. Built with PlatformIO.
- `firmware/cluster_node3_sentinel_esp32`: Channel sentinel node with fault-injection pushbutton on GPIO 27 and blue LED on GPIO 2. Built with PlatformIO.
- `server/app.py`: Full UDP cluster ingestion (port 4210) supporting nodes 1, 2, 3, A, B, C; state machine; and live WebSocket streaming.
- `frontend/`: 3D cluster visualization with live twin OLED displays for Node 1 and Node 2, real-time IR ADC telemetry, cluster status indicators, and pre-compiled bundle in `web/dist`.
- Verified 14 unit tests passing cleanly in `tests/test_hub_phase2.py`.

## Constraints
# Constraints
- Phone Hotspot: SSID "Dojinix", Password "hello123", UDP Port 4210.
- Dashboard on port 8500 (`http://localhost:8500` or `http://localhost:8500/app`).

## Active Tasks
- Hardware flashing by user (`pio run -d firmware/... -t upload`).
- Run backend (`nix-shell --run "python3 server/app.py"`).
- Connect boards to phone hotspot and run live demo.

