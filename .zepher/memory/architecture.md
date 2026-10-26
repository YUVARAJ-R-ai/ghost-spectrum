# Architecture

UNKNOWN

## [2026-10-24T17:05:38.178Z]
Ghost-Spectrum Tri-Node RF resilience architecture: Node 1 Sentinel ESP32 (L2 Wi-Fi sniffer at 921600 baud), Node 2 Mission ESP32 (nominal Wi-Fi + FS1000A 433MHz failover), Node 3 Sub-GHz Gateway Arduino Uno (XY-MK-5V 433MHz RX + relay data channel switch). Edge FastAPI server runs SecOps agent and Mission Control UI on port 8500.

## [2026-10-24] Pivot: Link Doctor
Project reframed from "RF intrusion / air-gap relay" to a self-diagnosing IoT link: Node A ESP32 (real Wi-Fi to phone hotspot, LDR sensor, link metrics, reflex fallback, store-and-forward, FS1000A TX), Node B Uno (433 RX -> JSON over USB, relay = fallback indicator), Node C ESP32 sentinel without NRF24 (optional channel traffic/deauth counter). Laptop hub server/app.py merges Wi-Fi (UDP 4210) and radio paths by seq, counts lost readings, runs server/brain.py (RandomForest from tools/train.py or rule fallback + agent with pre-emptive make-before-break switching). Agent is offline by design: an internet LLM would fail exactly when the hotspot dies.
