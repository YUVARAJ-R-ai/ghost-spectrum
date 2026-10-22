"""
Ghost-Spectrum Edge SecOps Mission Control Server
FastAPI Backend with WebSockets, Real-time Serial Telemetry Pipeline,
Autonomous Agent Orchestration, and Interactive HIL Attack Simulation.
"""

import os
import sys
import glob
import json
import time
import asyncio
import threading
import random
from typing import List, Dict, Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
import uvicorn

from agent import SecOpsAgent
from protocol import pack_subghz_frame

# Initialize FastAPI App
app = FastAPI(title="Ghost-Spectrum Mission Control", version="1.0.0")

# Agent and Log Buffer
log_history: List[str] = []

def agent_log_callback(msg: str):
    log_history.append(msg)
    if len(log_history) > 100:
        log_history.pop(0)

agent = SecOpsAgent(log_callback=agent_log_callback)

# Active WebSocket connections
connected_websockets: List[WebSocket] = []

# Hardware Serial connection state
serial_port_obj = None
serial_connected = False
active_serial_port = "SIMULATOR"

# Global simulation injection state
injection_state = {
    "mode": "NOMINAL",       # "NOMINAL", "BENIGN_BT", "DEAUTH_FLOOD", "JAMMING"
    "intensity": 1.0,
    "remaining_ticks": 0
}

# Telemetry continuity metrics (for Panel D)
telemetry_timeline = {
    "wifi_packets": 0,
    "wifi_loss_rate": 0.0,
    "subghz_packets": 0,
    "subghz_pdr": 100.0
}

def generate_simulated_telemetry(seq: int) -> Dict[str, Any]:
    """Generates ultra-realistic 125-channel RF spectrum & frame telemetry"""
    global injection_state, telemetry_timeline

    now_ms = int(time.time() * 1000)
    bins = [0] * 125

    # Nominal background noise (Wi-Fi Ch 1, 6, 11 occasional packet bursts)
    wifi_center_bins = [12, 37, 62] # Approximate 2.4GHz Wi-Fi channels
    for ch_bin in wifi_center_bins:
        for offset in range(-4, 5):
            idx = ch_bin + offset
            if 0 <= idx < 125 and random.random() < 0.25:
                bins[idx] = 1

    deauth_count = 0
    disassoc_count = 0
    beacon_count = random.randint(8, 14)
    data_count = random.randint(15, 35)
    target_bssid = "34:85:18:A2:B4:90"
    unique_macs = random.randint(4, 12)

    # Process Active Injection Mode
    if injection_state["mode"] == "BENIGN_BT":
        # Bluetooth frequency hopping spreads across 2402-2480 MHz (bins 2 to 80)
        for i in range(2, 82):
            if random.random() < 0.70:
                bins[i] = 1
        # Crucial: Deauth velocity remains zero!
        deauth_count = 0
        disassoc_count = 0
        data_count = random.randint(10, 20)

    elif injection_state["mode"] == "DEAUTH_FLOOD":
        # Targeted deauth injection: concentrated on Wi-Fi channel 6 (bin 37)
        for offset in range(-6, 7):
            idx = 37 + offset
            if 0 <= idx < 125 and random.random() < 0.65:
                bins[idx] = 1
        deauth_count = random.randint(35, 75) # 35-75 per 200ms -> 175-375 fps!
        disassoc_count = random.randint(2, 6)
        data_count = max(0, 15 - deauth_count // 3)
        unique_macs = 1 # Classic single attacker MAC
        target_bssid = "34:85:18:A2:B4:90"

    elif injection_state["mode"] == "JAMMING":
        # Uniform broad energy floor saturation across all 125 channels
        for i in range(125):
            bins[i] = 1 if random.random() < 0.94 else 0
        deauth_count = 0
        disassoc_count = 0
        data_count = 0
        beacon_count = 0 # All frames corrupted / zero decode

    if injection_state["remaining_ticks"] > 0:
        injection_state["remaining_ticks"] -= 1
        if injection_state["remaining_ticks"] == 0:
            injection_state["mode"] = "NOMINAL"

    # Calculate ratios
    active_bins = sum(bins)
    energy_ratio = active_bins / 125.0

    # Update continuity stats
    if agent.state == "AIRGAPPED_OOB_SURVIVAL" or agent.subghz_failover_active:
        telemetry_timeline["wifi_loss_rate"] = 100.0
        telemetry_timeline["subghz_packets"] += 1
        telemetry_timeline["subghz_pdr"] = 100.0
    else:
        telemetry_timeline["wifi_packets"] += data_count
        telemetry_timeline["wifi_loss_rate"] = 0.0 if injection_state["mode"] != "JAMMING" else 100.0

    return {
        "seq": seq,
        "timestamp_ms": now_ms,
        "channel": 6,
        "deauth_count": deauth_count,
        "disassoc_count": disassoc_count,
        "beacon_count": beacon_count,
        "data_count": data_count,
        "target_bssid": target_bssid,
        "unique_source_macs": unique_macs,
        "nrf_energy_ratio": round(energy_ratio, 2),
        "spectral_entropy": round(agent.calculate_entropy_from_bins(bins), 3),
        "nrf_present": True,
        "nrf_bins": bins
    }

# Background Hardware Serial Reader Thread
def serial_worker_loop():
    global serial_port_obj, serial_connected, active_serial_port

    try:
        import serial
    except ImportError:
        serial = None

    seq = 0
    while True:
        # Check if hardware serial is available
        if serial and not serial_connected:
            ports = glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*")
            for p in ports:
                try:
                    s = serial.Serial(p, baudrate=921600, timeout=0.2)
                    serial_port_obj = s
                    serial_connected = True
                    active_serial_port = p
                    agent.log(f"Connected to Sentinel Hardware Node on {p} at 921600 baud.")
                    break
                except Exception:
                    continue

        # Ingest from serial or fall back to simulated telemetry
        if serial_connected and serial_port_obj:
            try:
                line = serial_port_obj.readline().decode("utf-8", errors="ignore").strip()
                if line.startswith("{") and line.endswith("}"):
                    data = json.loads(line)
                    agent.process_telemetry(data)
                elif line:
                    # Echo raw node output
                    pass
            except Exception as e:
                serial_connected = False
                active_serial_port = "SIMULATOR (HIL Fallback)"
                agent.log(f"Serial disconnected ({e}). Switched to HIL Simulator engine.")
        else:
            # Run simulation cycle at 5 Hz (every 200 ms)
            seq += 1
            data = generate_simulated_telemetry(seq)
            agent.process_telemetry(data)
            time.sleep(0.2)

# Start background serial/telemetry thread
thread = threading.Thread(target=serial_worker_loop, daemon=True)
thread.start()

# WebSocket Broadcast Task
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connected_websockets.append(websocket)
    try:
        while True:
            # Package state packet for Mission Control UI
            payload = {
                "telemetry": agent.latest_telemetry,
                "agent_summary": agent.get_state_summary(),
                "logs": log_history[-15:],
                "continuity": {
                    "wifi_packets": telemetry_timeline["wifi_packets"],
                    "wifi_loss_rate": telemetry_timeline["wifi_loss_rate"],
                    "subghz_packets": telemetry_timeline["subghz_packets"],
                    "subghz_pdr": telemetry_timeline["subghz_pdr"]
                },
                "hardware": {
                    "connected": serial_connected,
                    "port": active_serial_port
                }
            }
            await websocket.send_text(json.dumps(payload))
            await asyncio.sleep(0.1) # 10 Hz UI refresh rate
    except WebSocketDisconnect:
        connected_websockets.remove(websocket)
    except Exception:
        if websocket in connected_websockets:
            connected_websockets.remove(websocket)

# REST API Endpoints for Interactive Evaluation
@app.get("/api/status")
async def get_status():
    return {
        "agent": agent.get_state_summary(),
        "hardware_port": active_serial_port,
        "hardware_connected": serial_connected,
        "timeline": telemetry_timeline
    }

@app.post("/api/simulate/benign")
async def simulate_benign():
    global injection_state
    injection_state["mode"] = "BENIGN_BT"
    injection_state["remaining_ticks"] = 30 # 6 seconds of Bluetooth traffic
    agent.log("Injecting 2.4 GHz Benign Bluetooth RF interference...")
    return {"status": "ok", "mode": "BENIGN_BT"}

@app.post("/api/simulate/deauth")
async def simulate_deauth():
    global injection_state
    injection_state["mode"] = "DEAUTH_FLOOD"
    injection_state["remaining_ticks"] = 30 # 6 seconds of high velocity flood
    agent.log("Injecting high-velocity 802.11 Deauth/Disassociation flood attack...")
    return {"status": "ok", "mode": "DEAUTH_FLOOD"}

@app.post("/api/simulate/jamming")
async def simulate_jamming():
    global injection_state
    injection_state["mode"] = "JAMMING"
    injection_state["remaining_ticks"] = 30 # 6 seconds of wideband jamming
    agent.log("Injecting full 125-channel 2.4 GHz continuous carrier jamming...")
    return {"status": "ok", "mode": "JAMMING"}

@app.post("/api/action/trip")
async def manual_trip():
    agent.execute_mitigation("MANUAL OPERATOR AIR-GAP COMMAND", time.time())
    if serial_connected and serial_port_obj:
        try:
            serial_port_obj.write(b"TRIP\n")
        except Exception:
            pass
    return {"status": "airgap_tripped"}

@app.post("/api/action/reset")
async def manual_reset():
    global injection_state, telemetry_timeline
    injection_state["mode"] = "NOMINAL"
    injection_state["remaining_ticks"] = 0
    telemetry_timeline["wifi_loss_rate"] = 0.0
    agent.reset_to_nominal()
    if serial_connected and serial_port_obj:
        try:
            serial_port_obj.write(b"RESET\n")
        except Exception:
            pass
    return {"status": "reset_success"}

@app.get("/api/incidents")
async def get_incidents():
    incidents_dir = os.path.join(os.path.dirname(__file__), "incidents")
    files = glob.glob(os.path.join(incidents_dir, "*.json"))
    results = []
    for f in sorted(files, reverse=True):
        try:
            with open(f, "r") as fp:
                results.append(json.load(fp))
        except Exception:
            pass
    return results

# Mount Web Directory
web_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "web"))
app.mount("/static", StaticFiles(directory=web_dir), name="static")

@app.get("/")
async def root_index():
    return FileResponse(os.path.join(web_dir, "index.html"))

@app.get("/circuits")
async def root_circuits():
    return FileResponse(os.path.join(web_dir, "circuits.html"))

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8500)))
