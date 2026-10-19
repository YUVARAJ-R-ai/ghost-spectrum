#!/usr/bin/env python3
"""
KINESIS CSI Live Stream Monitor
===============================
Reads raw CSI frames from the KINESIS Receiver ESP32 over serial.
Displays:
 - Live packet reception rate (Hz)
 - RSSI & noise floor
 - Real-time hand motion perturbation index (ΔCSI)
 - Live terminal disturbance bar graph
 - Optional CSV logging for dataset collection
"""

import sys
import time
import math
import argparse
import os

try:
    import serial
except ImportError:
    print("Error: pyserial is required. Run within 'nix-shell' or install pyserial.")
    sys.exit(1)


def parse_csi_line(line: str):
    """
    Parses a line formatted as:
    CSI_DATA,<seq>,<mac>,<rssi>,<rate>,<chan>,<noise>,<timestamp>,<sig_len>,<len>,<first_word>,"[<data>]"
    """
    line = line.strip()
    if not line.startswith("CSI_DATA,"):
        return None

    try:
        data_start = line.find('"[')
        data_end = line.rfind(']"')
        if data_start == -1 or data_end == -1:
            return None

        meta_str = line[:data_start].rstrip(',')
        meta_parts = meta_str.split(',')

        seq = int(meta_parts[1])
        mac = meta_parts[2]
        rssi = int(meta_parts[3])
        channel = int(meta_parts[5])
        timestamp = int(meta_parts[7])
        csi_len = int(meta_parts[9])

        raw_array_str = line[data_start + 2:data_end]
        raw_vals = [int(x) for x in raw_array_str.split(',') if x.strip()]

        # Each subcarrier has 2 bytes: Imaginary, Real (I, Q)
        # Amplitudes: sqrt(imag^2 + real^2)
        amplitudes = []
        for i in range(0, len(raw_vals) - 1, 2):
            imag = raw_vals[i]
            real = raw_vals[i + 1]
            amp = math.sqrt(imag * imag + real * real)
            amplitudes.append(amp)

        return {
            "seq": seq,
            "mac": mac,
            "rssi": rssi,
            "channel": channel,
            "timestamp": timestamp,
            "subcarriers": len(amplitudes),
            "amplitudes": amplitudes,
            "raw": raw_vals
        }
    except Exception:
        return None


def main():
    parser = argparse.ArgumentParser(description="KINESIS Live CSI Monitor")
    parser.add_argument("-p", "--port", default="/dev/ttyUSB1", help="Serial port of RX ESP32 (default: /dev/ttyUSB1)")
    parser.add_argument("-b", "--baud", type=int, default=921600, help="Baud rate (default: 921600)")
    parser.add_argument("-l", "--log", default=None, help="Optional CSV file to log CSI frames")
    args = parser.parse_args()

    print(f"\n=======================================================")
    print(f"  KINESIS Live CSI Stream Monitor")
    print(f"  Connecting to {args.port} @ {args.baud} baud...")
    print(f"=======================================================\n")

    try:
        ser = serial.Serial(args.port, args.baud, timeout=1.0)
    except Exception as e:
        print(f"Error opening serial port {args.port}: {e}")
        print("Tip: Check device connection or port permissions.")
        sys.exit(1)

    log_file = None
    if args.log:
        os.makedirs(os.path.dirname(os.path.abspath(args.log)), exist_ok=True)
        log_file = open(args.log, "w")
        log_file.write("seq,timestamp,rssi,delta_csi,amplitudes\n")
        print(f"[*] Logging to {args.log}")

    prev_amplitudes = None
    pkt_count = 0
    start_time = time.time()
    last_report_time = start_time
    rate_hz = 0.0

    print("Listening for CSI frames from transmitter...\n")

    try:
        while True:
            raw_line = ser.readline()
            if not raw_line:
                continue

            try:
                line_str = raw_line.decode('utf-8', errors='ignore')
            except Exception:
                continue

            pkt = parse_csi_line(line_str)
            if not pkt:
                continue

            pkt_count += 1
            curr_amps = pkt["amplitudes"]
            delta_csi = 0.0

            if prev_amplitudes and len(prev_amplitudes) == len(curr_amps):
                diffs = [abs(curr_amps[i] - prev_amplitudes[i]) for i in range(len(curr_amps))]
                delta_csi = sum(diffs) / len(diffs)
            prev_amplitudes = curr_amps

            if log_file:
                amp_str = ";".join(f"{a:.1f}" for a in curr_amps)
                log_file.write(f"{pkt['seq']},{pkt['timestamp']},{pkt['rssi']},{delta_csi:.3f},{amp_str}\n")

            now = time.time()
            if now - last_report_time >= 0.1:  # Update display at 10 Hz
                elapsed = now - start_time
                rate_hz = pkt_count / elapsed if elapsed > 0 else 0

                # Motion intensity visual bar (ASCII)
                bar_len = min(40, int(delta_csi * 4))
                motion_bar = "█" * bar_len + "░" * (40 - bar_len)

                status_label = "STILL   " if delta_csi < 2.0 else "MOTION! "

                sys.stdout.write(
                    f"\r[Pkt: {pkt['seq']:6d}] | Rate: {rate_hz:5.1f} Hz | RSSI: {pkt['rssi']:3d} dBm | "
                    f"Subcarriers: {pkt['subcarriers']} | ΔCSI: {delta_csi:5.2f} | [{status_label}] [{motion_bar}]"
                )
                sys.stdout.flush()
                last_report_time = now

    except KeyboardInterrupt:
        print("\n\nStopped by user.")
    finally:
        ser.close()
        if log_file:
            log_file.close()


if __name__ == "__main__":
    main()
