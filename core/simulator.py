"""
KINESIS Physical RF & Fresnel CSI Simulator
===========================================
Simulates 2.4 GHz electromagnetic wave propagation and multipath reflections
for a moving reflector (hand) in a 2D desktop environment.
Outputs synthetic CSI data identical in structure to live ESP32 frames.
"""

import math
import time
from typing import Tuple, List, Optional
import numpy as np

C_LIGHT = 299792458.0
F_CENTER = 2.412e9
CHANNEL_BW = 20e6  # 20 MHz
TARGET_SUBCARRIERS = 126


class CSISimulator:
    def __init__(
        self,
        tx_pos: Tuple[float, float] = (-0.4, 0.0),
        rx_pos: Tuple[float, float] = (0.4, 0.0),
        sampling_rate: float = 100.0,
        noise_level: float = 0.4
    ):
        self.tx_pos = np.array(tx_pos, dtype=np.float32)
        self.rx_pos = np.array(rx_pos, dtype=np.float32)
        self.fs = sampling_rate
        self.noise_level = noise_level
        self.seq = 0

        # Subcarrier frequency grid across 20 MHz bandwidth
        subcarrier_indices = np.linspace(-1.0, 1.0, TARGET_SUBCARRIERS)
        self.subcarrier_freqs = F_CENTER + subcarrier_indices * (CHANNEL_BW / 2.0)

        # Static LoS component
        self.d_los = float(np.linalg.norm(self.rx_pos - self.tx_pos))
        self.los_phase = np.exp(-1j * 2.0 * np.pi * self.subcarrier_freqs * (self.d_los / C_LIGHT))
        self.a_los = 35.0  # Dominant LoS amplitude

        # Static room clutter (desk, monitor, walls)
        self.static_scatterers = [
            (np.array([0.0, 0.6]), 8.0),   # Monitor
            (np.array([-0.6, 0.5]), 5.0),  # Left wall
            (np.array([0.6, 0.5]), 5.0),   # Right wall
        ]
        self.static_clutter = np.zeros(TARGET_SUBCARRIERS, dtype=np.complex64)
        for s_pos, s_amp in self.static_scatterers:
            d_s = np.linalg.norm(s_pos - self.tx_pos) + np.linalg.norm(self.rx_pos - s_pos)
            self.static_clutter += s_amp * np.exp(-1j * 2.0 * np.pi * self.subcarrier_freqs * (d_s / C_LIGHT))

    def step(self, hand_pos: Tuple[float, float], active: bool = True) -> Tuple[np.ndarray, np.ndarray, str]:
        """
        Calculates synthetic CSI for a given hand position (x, y) in meters.
        Returns:
            amps: np.ndarray (126,) of subcarrier amplitudes
            complex_h: np.ndarray (126,) of complex CSI
            raw_line: formatted CSI_DATA string
        """
        self.seq += 1
        pos = np.array(hand_pos, dtype=np.float32)

        if active:
            # Reflected dynamic path distance: TX -> Hand -> RX
            d_tx_hand = np.linalg.norm(pos - self.tx_pos)
            d_hand_rx = np.linalg.norm(self.rx_pos - pos)
            d_refl = float(d_tx_hand + d_hand_rx)

            # Inverse square law attenuation + hand radar cross section
            refl_amp = max(2.0, 18.0 / (d_refl ** 2 + 0.1))
            h_dynamic = refl_amp * np.exp(-1j * 2.0 * np.pi * self.subcarrier_freqs * (d_refl / C_LIGHT))
        else:
            h_dynamic = np.zeros(TARGET_SUBCARRIERS, dtype=np.complex64)

        # Thermal Gaussian noise
        noise = (np.random.randn(TARGET_SUBCARRIERS) + 1j * np.random.randn(TARGET_SUBCARRIERS)) * self.noise_level

        # Total channel response
        total_h = (self.a_los * self.los_phase) + self.static_clutter + h_dynamic + noise

        imags = np.imag(total_h).astype(np.int16)
        reals = np.real(total_h).astype(np.int16)
        amps = np.abs(total_h).astype(np.float32)

        # Build raw string matching ESP32 firmware output
        pairs = []
        # Prepend 4 dummy bytes as in ESP32 hardware
        pairs.extend(["83", "48", "5", "0"])
        for i in range(TARGET_SUBCARRIERS):
            pairs.append(str(int(imags[i])))
            pairs.append(str(int(reals[i])))

        data_body = ",".join(pairs)
        ts = int(time.time() * 1000)
        raw_line = f'CSI_DATA,{self.seq},1a:00:00:00:00:00,-20,11,11,-95,{ts},83,256,1,"[{data_body}]"'

        return amps, total_h, raw_line


class TrajectoryGenerator:
    """Generates synthetic test trajectories for automated validation."""
    def __init__(self, mode: str = "circle"):
        self.mode = mode
        self.t = 0.0

    def next_point(self, dt: float = 0.01) -> Tuple[float, float, str]:
        self.t += dt
        if self.mode == "circle":
            x = 0.25 * math.cos(self.t * 2.0)
            y = 0.35 + 0.15 * math.sin(self.t * 2.0)
            label = "CIRCLE"
        elif self.mode == "swipe_x":
            x = 0.3 * math.sin(self.t * 3.0)
            y = 0.35
            label = "SWIPE_LEFT" if math.cos(self.t * 3.0) < 0 else "SWIPE_RIGHT"
        elif self.mode == "push_y":
            x = 0.0
            y = 0.35 + 0.2 * math.sin(self.t * 3.0)
            label = "PUSH" if math.cos(self.t * 3.0) > 0 else "PULL"
        else:
            x, y = 0.0, 0.35
            label = "STILL"
        return x, y, label
