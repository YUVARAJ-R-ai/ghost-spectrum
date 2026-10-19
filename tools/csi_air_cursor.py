#!/usr/bin/env python3
"""
KINESIS 2D Air Cursor Demo (Robust Edition)
===========================================
- Immune to variable packet lengths / serial corruption
- Auto-reconnects on serial glitches
- Damped spring-mass cursor physics with deadband filtering
"""

import sys
import time
import math
import argparse
import threading
from collections import deque
import numpy as np

try:
    import serial
except ImportError:
    print("Error: pyserial required. Run inside 'nix-shell'.")
    sys.exit(1)

try:
    import matplotlib.pyplot as plt
    import matplotlib.animation as animation
except ImportError:
    print("Error: matplotlib required. Run inside 'nix-shell'.")
    sys.exit(1)

TARGET_SUBCARRIERS = 126


def parse_csi_line(line: str, target_len: int = TARGET_SUBCARRIERS):
    line = line.strip()
    if not line.startswith("CSI_DATA,"):
        return None
    try:
        data_start = line.find('"[')
        data_end = line.rfind(']"')
        if data_start == -1 or data_end == -1:
            return None

        raw_str = line[data_start + 2:data_end]
        raw_vals = [int(x) for x in raw_str.split(',') if x.strip()]
        if len(raw_vals) < 8:
            return None

        # Discard first 4 header bytes; convert (Imag, Real) -> Amplitude
        amplitudes = []
        for i in range(4, len(raw_vals) - 1, 2):
            imag = raw_vals[i]
            real = raw_vals[i + 1]
            amplitudes.append(math.sqrt(imag * imag + real * real))

        # Enforce constant array length to prevent NumPy broadcast crashes
        if len(amplitudes) < target_len:
            amplitudes = amplitudes + [0.0] * (target_len - len(amplitudes))
        elif len(amplitudes) > target_len:
            amplitudes = amplitudes[:target_len]

        return np.array(amplitudes, dtype=np.float32)
    except Exception:
        return None


class CSIStreamer(threading.Thread):
    def __init__(self, port="/dev/ttyUSB1", baud=921600):
        super().__init__(daemon=True)
        self.port = port
        self.baud = baud
        self.running = True
        self.queue = deque(maxlen=200)
        self.ser = None

    def run(self):
        while self.running:
            try:
                if self.ser is None or not self.ser.is_open:
                    self.ser = serial.Serial(self.port, self.baud, timeout=0.1)
                    self.ser.reset_input_buffer()
                    print(f"[*] Connected to {self.port} @ {self.baud} baud")

                while self.running:
                    try:
                        line = self.ser.readline().decode('utf-8', errors='ignore')
                        if not line:
                            continue
                        amps = parse_csi_line(line)
                        if amps is not None and len(amps) == TARGET_SUBCARRIERS:
                            self.queue.append(amps)
                    except (serial.SerialException, OSError):
                        print("[!] Serial glitch, attempting reconnect...")
                        break
            except Exception as e:
                time.sleep(0.5)

    def stop(self):
        self.running = False
        if self.ser and self.ser.is_open:
            try:
                self.ser.close()
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="KINESIS 2D Air Cursor")
    parser.add_argument("-p", "--port", default="/dev/ttyUSB1", help="Serial port")
    parser.add_argument("-b", "--baud", type=int, default=921600, help="Baud rate")
    args = parser.parse_args()

    streamer = CSIStreamer(port=args.port, baud=args.baud)
    streamer.start()

    print("Waiting for ESP32 CSI stream...")
    timeout = time.time() + 5.0
    while len(streamer.queue) == 0 and time.time() < timeout:
        time.sleep(0.05)

    if len(streamer.queue) == 0:
        print("[ERROR] No stream received. Ensure device is plugged into", args.port)
        streamer.stop()
        sys.exit(1)

    first_frame = streamer.queue[-1]
    baseline = np.copy(first_frame)
    alpha = 0.03

    # Cursor dynamics (position, velocity)
    pos_x, pos_y = 0.0, 0.0
    vel_x, vel_y = 0.0, 0.0

    fig, ax = plt.subplots(figsize=(7, 7))
    fig.patch.set_facecolor('#0B0E17')
    ax.set_facecolor('#101522')
    ax.set_xlim(-1.2, 1.2)
    ax.set_ylim(-1.2, 1.2)
    ax.set_aspect('equal')

    for spine in ax.spines.values():
        spine.set_color('#3A4556')
    ax.tick_params(colors='#6B7B93')
    ax.grid(True, linestyle=':', color='#222A3B')

    # Interaction boundary
    circle = plt.Circle((0, 0), 1.0, color='#00E5CC', fill=False, linestyle='--', alpha=0.4)
    ax.add_patch(circle)
    ax.plot([0], [0], '+', color='#3A4556', markersize=15)

    cursor_dot, = ax.plot([0], [0], 'o', color='#00E5CC', markersize=22, alpha=0.9, markeredgecolor='white', markeredgewidth=2)
    trail, = ax.plot([], [], '-', color='#388BFD', alpha=0.6, lw=2.5)
    history_trail = deque(maxlen=25)

    title_text = ax.set_title("KINESIS Air Cursor — Waiting for Motion", color='#00E5CC', fontsize=11, fontweight='bold')

    def update(frame):
        nonlocal baseline, pos_x, pos_y, vel_x, vel_y

        frames = []
        while len(streamer.queue) > 0:
            frames.append(streamer.queue.popleft())

        if frames:
            total_energy = 0.0
            for f in frames:
                # Shape safety check
                if f.shape != baseline.shape:
                    continue

                baseline = (1 - alpha) * baseline + alpha * f
                diff = f - baseline

                # Subcarrier frequency partition:
                # Lower subcarriers vs upper subcarriers Doppler tilt
                mid = TARGET_SUBCARRIERS // 2
                low_e = np.mean(np.abs(diff[:mid]))
                high_e = np.mean(np.abs(diff[mid:]))
                total_energy = (low_e + high_e) / 2.0

                # Motion deadband (ignore static room noise floor)
                if total_energy > 1.8:
                    # Dynamic steering force
                    fx = (high_e - low_e) * 0.08
                    fy = (total_energy - 1.8) * 0.06

                    vel_x += fx
                    vel_y += fy
                else:
                    # Spring damping back to origin when resting
                    vel_x *= 0.85
                    vel_y *= 0.85

            # Damped physics update
            vel_x *= 0.90
            vel_y *= 0.90
            pos_x += vel_x
            pos_y += vel_y

            # Damped recentering spring force
            pos_x *= 0.95
            pos_y *= 0.95

            pos_x = float(np.clip(pos_x, -1.0, 1.0))
            pos_y = float(np.clip(pos_y, -1.0, 1.0))

            cursor_dot.set_data([pos_x], [pos_y])
            history_trail.append((pos_x, pos_y))

            tx = [p[0] for p in history_trail]
            ty = [p[1] for p in history_trail]
            trail.set_data(tx, ty)

            if total_energy > 1.8:
                cursor_dot.set_color('#FFB800')
                title_text.set_text(f"Motion Detected! Perturbation Energy: {total_energy:.2f}")
            else:
                cursor_dot.set_color('#00E5CC')
                title_text.set_text("Stationary / Idle — Move hand across the link")

        return [cursor_dot, trail, title_text]

    ani = animation.FuncAnimation(fig, update, interval=25, blit=False, cache_frame_data=False)
    try:
        plt.show()
    finally:
        streamer.stop()


if __name__ == "__main__":
    main()
