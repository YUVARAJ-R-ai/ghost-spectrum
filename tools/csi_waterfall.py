#!/usr/bin/env python3
"""
KINESIS Real-Time Subcarrier Waterfall & RF Perturbation Visualizer
==================================================================
Uses a dedicated non-blocking serial acquisition thread to feed a live
Matplotlib visualization with static background subtraction and dynamic
clutter filtering.
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
    """Extract complex subcarrier amplitudes from a raw CSI_DATA frame."""
    line = line.strip()
    if not line.startswith("CSI_DATA,"):
        return None
    try:
        data_start = line.find('"[')
        data_end = line.rfind(']"')
        if data_start == -1 or data_end == -1:
            return None

        raw_array_str = line[data_start + 2:data_end]
        raw_vals = [int(x) for x in raw_array_str.split(',') if x.strip()]
        if len(raw_vals) < 4:
            return None

        # Each subcarrier is stored as [Imaginary, Real]
        # Skip first 4 bytes (often internal hardware flags on ESP32)
        start_idx = 4
        amplitudes = []
        for i in range(start_idx, len(raw_vals) - 1, 2):
            imag = raw_vals[i]
            real = raw_vals[i + 1]
            amp = math.sqrt(imag * imag + real * real)
            amplitudes.append(amp)

        if len(amplitudes) < target_len:
            amplitudes = amplitudes + [0.0] * (target_len - len(amplitudes))
        elif len(amplitudes) > target_len:
            amplitudes = amplitudes[:target_len]

        return np.array(amplitudes, dtype=np.float32)
    except Exception:
        return None


class SerialReaderThread(threading.Thread):
    def __init__(self, port, baud):
        super().__init__(daemon=True)
        self.port = port
        self.baud = baud
        self.running = True
        self.queue = deque(maxlen=200)
        self.packet_count = 0
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
                        line_bytes = self.ser.readline()
                        if not line_bytes:
                            continue
                        line_str = line_bytes.decode('utf-8', errors='ignore')
                        amps = parse_csi_line(line_str)
                        if amps is not None and len(amps) == TARGET_SUBCARRIERS:
                            self.queue.append(amps)
                            self.packet_count += 1
                    except (serial.SerialException, OSError):
                        print("[!] Serial glitch, attempting reconnect...")
                        break
            except Exception:
                time.sleep(0.5)

    def stop(self):
        self.running = False
        if self.ser and self.ser.is_open:
            try:
                self.ser.close()
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="KINESIS Live CSI Visualizer")
    parser.add_argument("-p", "--port", default="/dev/ttyUSB1", help="RX Serial Port")
    parser.add_argument("-b", "--baud", type=int, default=921600, help="Baud rate")
    parser.add_argument("-w", "--window", type=int, default=120, help="History window length (frames)")
    args = parser.parse_args()

    # Start non-blocking acquisition thread
    reader = SerialReaderThread(args.port, args.baud)
    reader.start()

    print(f"Connecting to {args.port} at {args.baud} baud... Waiting for data stream...")
    timeout = time.time() + 5.0
    while len(reader.queue) == 0 and time.time() < timeout:
        time.sleep(0.05)

    if len(reader.queue) == 0:
        print("[ERROR] No CSI packets received after 5 seconds. Check connection.")
        reader.stop()
        sys.exit(1)

    first_frame = reader.queue[-1]
    n_subcarriers = len(first_frame)
    print(f"[OK] Stream active: {n_subcarriers} subcarriers detected per frame.")

    history_len = args.window
    raw_buffer = np.zeros((history_len, n_subcarriers), dtype=np.float32)
    filtered_buffer = np.zeros((history_len, n_subcarriers), dtype=np.float32)

    raw_buffer[:] = first_frame
    ema_baseline = np.copy(first_frame)
    alpha = 0.02  # Exponential Moving Average smoothing factor

    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(11, 8), gridspec_kw={'height_ratios': [2.2, 1]})
    fig.patch.set_facecolor('#0B0E17')
    for ax in (ax1, ax2):
        ax.set_facecolor('#101522')
        ax.tick_params(colors='#B0BCCE')
        for spine in ax.spines.values():
            spine.set_color('#3A4556')

    fig.canvas.manager.set_window_title("KINESIS — Live CSI Dynamic Perturbation Spectrogram")

    im = ax1.imshow(
        filtered_buffer,
        aspect='auto',
        cmap='inferno',
        origin='lower',
        vmin=0.0,
        vmax=15.0
    )
    ax1.set_title("Moving Hand Perturbation (Static Clutter Subtracted)", color='#00E5CC', fontsize=12, fontweight='bold')
    ax1.set_xlabel("Subcarrier Index", color='#B0BCCE')
    ax1.set_ylabel("Time History (Frames)", color='#B0BCCE')
    cbar = plt.colorbar(im, ax=ax1)
    cbar.ax.yaxis.set_tick_params(color='#B0BCCE')
    plt.setp(plt.getp(cbar.ax.axes, 'yticklabels'), color='#B0BCCE')

    subcarrier_indices = np.arange(n_subcarriers)
    line_filt = ax2.plot(subcarrier_indices, np.zeros(n_subcarriers), color='#00E5CC', lw=1.8, label="Dynamic Perturbation")[0]
    ax2.set_xlim(0, n_subcarriers - 1)
    ax2.set_ylim(0, 20)
    ax2.set_title("Instantaneous Hand Reflection Energy across Subcarriers", color='#388BFD', fontsize=11)
    ax2.set_xlabel("Subcarrier Index", color='#B0BCCE')
    ax2.set_ylabel("Perturbation Magnitude", color='#B0BCCE')
    ax2.grid(True, linestyle='--', color='#222A3B', alpha=0.7)
    legend = ax2.legend(loc='upper right', facecolor='#101522', edgecolor='#3A4556')
    for text in legend.get_texts():
        text.set_color('#B0BCCE')

    plt.tight_layout()

    last_time = time.time()
    last_pkts = reader.packet_count

    def update_frame(frame):
        nonlocal raw_buffer, filtered_buffer, ema_baseline, last_time, last_pkts

        new_frames = []
        while len(reader.queue) > 0:
            new_frames.append(reader.queue.popleft())

        if new_frames:
            for f in new_frames:
                if f.shape != ema_baseline.shape:
                    continue

                ema_baseline = (1 - alpha) * ema_baseline + alpha * f
                delta = np.abs(f - ema_baseline)

                raw_buffer = np.roll(raw_buffer, -1, axis=0)
                raw_buffer[-1, :] = f

                filtered_buffer = np.roll(filtered_buffer, -1, axis=0)
                filtered_buffer[-1, :] = delta

            im.set_data(filtered_buffer)
            curr_max = np.percentile(filtered_buffer, 98)
            im.set_clim(vmin=0, vmax=max(5.0, curr_max * 1.3))

            latest_delta = filtered_buffer[-1, :]
            line_filt.set_ydata(latest_delta)
            ax2.set_ylim(0, max(10.0, np.max(latest_delta) * 1.4))

            now = time.time()
            if now - last_time >= 0.5:
                rate_hz = (reader.packet_count - last_pkts) / (now - last_time)
                motion_energy = np.mean(latest_delta)
                status = ">>> MOVING <<<" if motion_energy > 2.0 else "STILL"
                fig.canvas.manager.set_window_title(
                    f"KINESIS | Stream: {rate_hz:.1f} Hz | Energy: {motion_energy:.2f} | Status: [{status}]"
                )
                last_time = now
                last_pkts = reader.packet_count

        return [im, line_filt]

    ani = animation.FuncAnimation(fig, update_frame, interval=25, blit=False, cache_frame_data=False)

    try:
        plt.show()
    finally:
        reader.stop()


if __name__ == "__main__":
    main()
