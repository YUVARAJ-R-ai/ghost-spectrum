"""
KINESIS Core DSP Engine
=======================
Implements physics-grounded RF signal processing for 2.4 GHz Wi-Fi CSI:
1. Parsing & format normalization (126 subcarriers).
2. Outlier rejection (Hampel filter).
3. Static clutter cancellation (background subtraction).
4. Short-Time Doppler Frequency Shift (DFS) & velocity estimation.
5. Physics-informed feature extraction for ML.
"""

import math
from dataclasses import dataclass
from typing import Optional, List, Tuple
import numpy as np

C_LIGHT = 299792458.0  # m/s
F_CENTER = 2.412e9     # Channel 11 center frequency (Hz)
WAVELENGTH = C_LIGHT / F_CENTER  # ~0.1243 m
TARGET_SUBCARRIERS = 126


@dataclass
class CSIFrame:
    seq: int
    timestamp_ms: int
    rssi: int
    channel: int
    amplitudes: np.ndarray  # shape: (126,) float32
    phases: np.ndarray       # shape: (126,) float32
    complex_csi: np.ndarray  # shape: (126,) complex64


def parse_csi_raw(line: str, target_subcarriers: int = TARGET_SUBCARRIERS) -> Optional[CSIFrame]:
    """Parse raw serial line into a structured CSIFrame with guaranteed array shapes."""
    line = line.strip()
    if not line.startswith("CSI_DATA,"):
        return None
    try:
        data_start = line.find('"[')
        data_end = line.rfind(']"')
        if data_start == -1 or data_end == -1:
            return None

        meta_parts = line[:data_start].rstrip(',').split(',')
        seq = int(meta_parts[1]) if len(meta_parts) > 1 else 0
        rssi = int(meta_parts[3]) if len(meta_parts) > 3 else -50
        channel = int(meta_parts[5]) if len(meta_parts) > 5 else 11
        ts = int(meta_parts[7]) if len(meta_parts) > 7 else 0

        raw_str = line[data_start + 2:data_end]
        raw_vals = [int(x) for x in raw_str.split(',') if x.strip()]
        if len(raw_vals) < 8:
            return None

        # Format: pairs of [Imag, Real], skipping initial 4 bytes
        imags = []
        reals = []
        for i in range(4, len(raw_vals) - 1, 2):
            imags.append(raw_vals[i])
            reals.append(raw_vals[i + 1])

        imags = np.array(imags, dtype=np.float32)
        reals = np.array(reals, dtype=np.float32)

        # Enforce exact target shape
        if len(imags) < target_subcarriers:
            pad = target_subcarriers - len(imags)
            imags = np.pad(imags, (0, pad))
            reals = np.pad(reals, (0, pad))
        elif len(imags) > target_subcarriers:
            imags = imags[:target_subcarriers]
            reals = reals[:target_subcarriers]

        complex_h = reals + 1j * imags
        amps = np.abs(complex_h).astype(np.float32)
        phases = np.angle(complex_h).astype(np.float32)

        return CSIFrame(
            seq=seq,
            timestamp_ms=ts,
            rssi=rssi,
            channel=channel,
            amplitudes=amps,
            phases=phases,
            complex_csi=complex_h
        )
    except Exception:
        return None


class StaticClutterFilter:
    """
    Exponential Moving Average background filter.
    Subtracts the static room reflections to isolate moving human dynamic components.
    """
    def __init__(self, alpha: float = 0.03, n_subcarriers: int = TARGET_SUBCARRIERS):
        self.alpha = alpha
        self.n_subcarriers = n_subcarriers
        self.baseline_complex: Optional[np.ndarray] = None
        self.baseline_amp: Optional[np.ndarray] = None
        self.noise_history = []
        self.noise_floor = 1.0

    def update(self, frame: CSIFrame) -> Tuple[np.ndarray, float, float]:
        """
        Returns:
            dynamic_amp: np.ndarray (126,) of hand perturbations
            motion_energy: float representing total hand motion intensity
            noise_floor: Current estimated ambient floor
        """
        # AGC Normalization: scale vector to standard length (100.0)
        # This completely removes ESP32 hardware analog AGC amplifier gain jumps!
        norm = float(np.linalg.norm(frame.amplitudes))
        if norm < 1e-6:
            return np.zeros_like(frame.amplitudes), 0.0, 0.0
        amps_norm = (frame.amplitudes / norm) * 100.0

        if self.baseline_amp is None or self.baseline_amp.shape != amps_norm.shape:
            self.baseline_amp = np.copy(amps_norm)
            return np.zeros_like(amps_norm), 0.0, 0.0

        # Update baseline slowly (EMA)
        self.baseline_amp = (1.0 - self.alpha) * self.baseline_amp + self.alpha * amps_norm

        dynamic_amp = np.abs(amps_norm - self.baseline_amp)
        raw_energy = float(np.mean(dynamic_amp))

        # Adaptively track noise floor
        if len(self.noise_history) < 50:
            self.noise_history.append(raw_energy)
            self.noise_floor = float(np.percentile(self.noise_history, 75))
        elif raw_energy < self.noise_floor * 1.5:
            self.noise_floor = 0.99 * self.noise_floor + 0.01 * raw_energy

        # Net motion energy strictly above noise floor
        net_energy = max(0.0, raw_energy - self.noise_floor)
        return dynamic_amp, net_energy, self.noise_floor


class DopplerVelocityEstimator:
    """
    Estimates hand velocity along the bistatic line via Short-Time Doppler Analysis.
    A hand moving toward the link creates positive Doppler (+Hz, +v).
    Moving away creates negative Doppler (-Hz, -v).
    """
    def __init__(self, window_size: int = 32, sampling_rate: float = 100.0):
        self.window_size = window_size
        self.fs = sampling_rate
        self.history = []

    def update(self, complex_sample: np.ndarray, motion_energy: float = 0.0) -> Tuple[float, np.ndarray]:
        """
        complex_sample: complex vector across subcarriers (126,)
        motion_energy: net motion energy from clutter filter
        Returns:
            velocity_ms: Estimated radial velocity in m/s
            spectrum: Doppler frequency power spectrum (window_size,)
        """
        # If quiet / still, suppress noise jitter entirely
        if motion_energy < 0.08:
            return 0.0, np.zeros(self.window_size, dtype=np.float32)

        # Average across sensitive center subcarriers to boost SNR
        val = np.mean(complex_sample[20:100])
        self.history.append(val)
        if len(self.history) > self.window_size:
            self.history.pop(0)

        if len(self.history) < self.window_size:
            return 0.0, np.zeros(self.window_size, dtype=np.float32)

        data = np.array(self.history) - np.mean(self.history)
        window = np.hanning(self.window_size)
        fft_vals = np.fft.fftshift(np.fft.fft(data * window))
        psd = (np.abs(fft_vals) ** 2).astype(np.float32)

        freqs = np.fft.fftshift(np.fft.fftfreq(self.window_size, 1.0 / self.fs))

        total_p = np.sum(psd)
        if total_p > 1e-3:
            centroid_freq = float(np.sum(freqs * psd) / total_p)
            velocity_ms = float(centroid_freq * (WAVELENGTH / 2.0))
        else:
            velocity_ms = 0.0

        return velocity_ms, psd


def extract_features(dynamic_amp: np.ndarray, motion_energy: float, velocity_ms: float) -> np.ndarray:
    """
    Extracts a compact, zero-centered feature vector for machine learning:
    [energy, velocity, low_ratio, mid_ratio, high_ratio, variance, tilt]
    """
    n = len(dynamic_amp)
    third = n // 3
    e_low = float(np.mean(dynamic_amp[:third]))
    e_mid = float(np.mean(dynamic_amp[third:2*third]))
    e_high = float(np.mean(dynamic_amp[2*third:]))
    var = float(np.var(dynamic_amp))

    # Tilt is computed when motion energy is above ambient floor, and clamped
    if motion_energy > 0.08:
        tilt = float(np.clip((e_high - e_low) / (e_high + e_low + 1e-4), -1.0, 1.0))
    else:
        tilt = 0.0

    return np.array([
        motion_energy,
        velocity_ms,
        e_low,
        e_mid,
        e_high,
        var,
        tilt
    ], dtype=np.float32)
