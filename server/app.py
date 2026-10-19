#!/usr/bin/env python3
"""
KINESIS Unified Streaming Server
================================
Zero-dependency HTTP + Server-Sent Events (SSE) server.
Streams real-time CSI spectrum, Doppler velocity, and gesture predictions
to the web frontend at 60 FPS.
Supports dual-mode:
 - Hardware Mode (Live ESP32 stream via /dev/ttyUSB1)
 - Simulator Mode (Pure physics 2.4 GHz Fresnel simulation)
"""

import sys
import os
import json
import time
import math
import threading
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from typing import Dict, Optional

# Add project root to path
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from core.dsp import parse_csi_raw, CSIFrame
from core.simulator import CSISimulator, TrajectoryGenerator
from core.ml_engine import KinesisMLEngine

PORT = 8765
WEB_DIR = os.path.join(PROJECT_ROOT, "web")


class StateManager:
    def __init__(self):
        self.mode = "hardware"  # "hardware" or "simulator"
        self.ml_engine = KinesisMLEngine()
        self.simulator = CSISimulator()
        self.trajectory_gen = TrajectoryGenerator(mode="circle")

        self.latest_state = {
            "mode": "hardware",
            "seq": 0,
            "energy": 0.0,
            "velocity": 0.0,
            "gesture": "STILL",
            "confidence": 0.0,
            "dx": 0.0,
            "dy": 0.0,
            "amps": [0.0] * 126,
            "psd": [0.0] * 32,
            "hand_x": 0.0,
            "hand_y": 0.35,
            "hardware_connected": False
        }
        self.sim_hand_pos = [0.0, 0.35]
        self.sim_auto = False  # Manual by default: hand is stationary unless dragged
        self.sim_last_move = time.time()
        self.running = True
        self.lock = threading.Lock()

    def update_hardware(self, line: str):
        frame = parse_csi_raw(line)
        if not frame:
            return

        res = self.ml_engine.process_frame(frame)
        with self.lock:
            self.latest_state.update({
                "mode": "hardware",
                "seq": int(frame.seq),
                "energy": float(res["energy"]),
                "velocity": float(res["velocity"]),
                "gesture": str(res["gesture"]),
                "confidence": float(res["confidence"]),
                "dx": float(res["dx"]),
                "dy": float(res["dy"]),
                "amps": [float(x) for x in res["dynamic_amp"]],
                "psd": [float(x) for x in res["psd"]],
                "hardware_connected": True
            })

    def update_simulator(self):
        if self.sim_auto:
            x, y, label = self.trajectory_gen.next_point(dt=0.01)
            self.sim_hand_pos = [x, y]
            is_moving = True
        else:
            x, y = self.sim_hand_pos
            # Moving only if actively dragged by mouse in last 250ms
            is_moving = (time.time() - self.sim_last_move) < 0.25

        amps, complex_h, raw_line = self.simulator.step(self.sim_hand_pos, active=is_moving)
        frame = parse_csi_raw(raw_line)
        if frame:
            res = self.ml_engine.process_frame(frame)
            with self.lock:
                self.latest_state.update({
                    "mode": "simulator",
                    "seq": int(frame.seq),
                    "energy": float(res["energy"]),
                    "velocity": float(res["velocity"]),
                    "gesture": str(res["gesture"]),
                    "confidence": float(res["confidence"]),
                    "dx": float(res["dx"]),
                    "dy": float(res["dy"]),
                    "amps": [float(x) for x in res["dynamic_amp"]],
                    "psd": [float(x) for x in res["psd"]],
                    "hand_x": float(x),
                    "hand_y": float(y),
                    "hardware_connected": True
                })


STATE = StateManager()


def serial_worker(port="/dev/ttyUSB1", baud=921600):
    """Background worker for live hardware stream."""
    try:
        import serial
    except ImportError:
        print("[WARN] PySerial not installed; hardware streaming disabled.")
        return

    while STATE.running:
        if STATE.mode != "hardware":
            time.sleep(0.1)
            continue

        try:
            ser = serial.Serial(port, baud, timeout=0.1)
            ser.reset_input_buffer()
            print(f"[OK] Hardware serial connected on {port}")
            with STATE.lock:
                STATE.latest_state["hardware_connected"] = True
            while STATE.running and STATE.mode == "hardware":
                line = ser.readline().decode('utf-8', errors='ignore')
                if line:
                    STATE.update_hardware(line)
            ser.close()
        except Exception as e:
            with STATE.lock:
                STATE.latest_state.update({
                    "mode": "hardware",
                    "energy": 0.0,
                    "velocity": 0.0,
                    "gesture": "DISCONNECTED",
                    "confidence": 0.0,
                    "dx": 0.0,
                    "dy": 0.0,
                    "amps": [0.0] * 126,
                    "psd": [0.0] * 32,
                    "hardware_connected": False
                })
            time.sleep(1.0)


def simulator_worker():
    """Background worker for physical simulation."""
    while STATE.running:
        if STATE.mode == "simulator":
            STATE.update_simulator()
            time.sleep(0.01)  # 100 Hz simulation step
        else:
            time.sleep(0.1)


class KinesisRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=WEB_DIR, **kwargs)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0')
        super().end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/stream":
            self.handle_sse_stream()
        elif parsed.path == "/api/status":
            self.send_json(STATE.latest_state)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        content_len = int(self.headers.get('Content-Length', 0))
        body_bytes = self.rfile.read(content_len) if content_len > 0 else b'{}'
        try:
            body = json.loads(body_bytes.decode('utf-8'))
        except Exception:
            body = {}

        if parsed.path == "/api/set_mode":
            mode = body.get("mode", "hardware")
            if mode in ["hardware", "simulator"]:
                STATE.mode = mode
                self.send_json({"status": "ok", "mode": STATE.mode})
            else:
                self.send_json({"error": "invalid mode"}, status=400)

        elif parsed.path == "/api/sim_target":
            STATE.sim_auto = False
            STATE.sim_hand_pos = [float(body.get("x", 0.0)), float(body.get("y", 0.35))]
            STATE.sim_last_move = time.time()
            self.send_json({"status": "ok", "pos": STATE.sim_hand_pos})

        elif parsed.path == "/api/sim_auto":
            STATE.sim_auto = bool(body.get("auto", True))
            self.send_json({"status": "ok", "auto": STATE.sim_auto})

        elif parsed.path == "/api/train":
            res = STATE.ml_engine.train_model()
            self.send_json(res)

        else:
            self.send_json({"error": "not found"}, status=404)

    def handle_sse_stream(self):
        """Server-Sent Events streaming at ~50 Hz."""
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Cache-Control', 'no-cache')
        self.send_header('Connection', 'keep-alive')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()

        try:
            while STATE.running:
                with STATE.lock:
                    data_str = json.dumps(STATE.latest_state, default=float)
                msg = f"data: {data_str}\n\n"
                self.wfile.write(msg.encode('utf-8'))
                self.wfile.flush()
                time.sleep(0.02)  # ~50 FPS
        except (BrokenPipeError, ConnectionResetError):
            pass

    def send_json(self, data, status=200):
        body = json.dumps(data, default=float).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):
        # Suppress noisy SSE logging in terminal
        pass


import socket


class DualStackServer(ThreadingHTTPServer):
    address_family = socket.AF_INET6

    def server_bind(self):
        self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        super().server_bind()


def main():
    # Start background threads
    t_hw = threading.Thread(target=serial_worker, daemon=True)
    t_sim = threading.Thread(target=simulator_worker, daemon=True)
    t_hw.start()
    t_sim.start()

    try:
        DualStackServer.allow_reuse_address = True
        httpd = DualStackServer(('::', PORT), KinesisRequestHandler)
    except Exception:
        ThreadingHTTPServer.allow_reuse_address = True
        httpd = ThreadingHTTPServer(('', PORT), KinesisRequestHandler)

    print("================================================================")
    print("  KINESIS Web Platform & Signal Suite Active")
    print(f"  Access Dashboard: http://localhost:{PORT} or http://127.0.0.1:{PORT}")
    print("  Dual Mode: Hardware Stream (/dev/ttyUSB1) + Physics Simulator")
    print("================================================================")

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server...")
    finally:
        STATE.running = False
        httpd.server_close()


if __name__ == "__main__":
    main()
