"""
Autonomous SecOps Agent Engine (The Brain)
Implements PRD Section 7 & 8:
- Sliding-window deauth velocity calculation
- Shannon spectral entropy calculation
- Multi-layer sensor fusion & triage
- Hardware mitigation dispatch (Failover + Air-gap relay)
"""

import time
import math
from typing import Dict, Any, List, Optional, Callable
from collections import deque
from forensic import generate_incident_report

class SecOpsAgent:
    def __init__(self, log_callback: Optional[Callable[[str], None]] = None):
        # Operational States per PRD Section 8:
        # "MONITORING", "TRIAGE", "BENIGN", "AIRGAPPED_OOB_SURVIVAL"
        self.state = "MONITORING"
        self.log_callback = log_callback

        # Detection Thresholds per PRD Section 7
        self.VELOCITY_THRESHOLD_FPS = 50.0  # > 50 fps indicates automated injection
        self.ENTROPY_THRESHOLD = 0.85       # > 0.85 indicates uniform broadband noise
        self.BENIGN_DEAUTH_MAX = 10.0       # Benign noise has near-zero deauth velocity

        # Sliding window for velocity calculation (500 ms window)
        self.deauth_history = deque(maxlen=20)
        self.window_duration_s = 0.5

        # Attack onset tracking for latency measurement
        self.attack_onset_time: Optional[float] = None
        self.mitigation_time: Optional[float] = None

        # Telemetry metrics
        self.latest_telemetry: Dict[str, Any] = {}
        self.current_entropy: float = 0.0
        self.current_velocity: float = 0.0
        self.current_dispersion: float = 1.0

        # Hardware mitigation states
        self.subghz_failover_active: bool = False
        self.airgap_relay_tripped: bool = False
        self.incident_reports: List[Dict[str, Any]] = []

    def log(self, message: str):
        formatted = f"[AGENT {time.strftime('%H:%M:%S')}]: {message}"
        print(formatted)
        if self.log_callback:
            self.log_callback(formatted)

    def calculate_entropy_from_bins(self, bins: List[int]) -> float:
        """Calculates Shannon Spectral Entropy: H(X) = - SUM [ P(c_i) * log2(P(c_i)) ] / log2(125)"""
        total = sum(bins)
        if total == 0:
            return 0.0
        entropy = 0.0
        for b in bins:
            if b > 0:
                p = b / total
                entropy -= p * math.log2(p)
        # Normalize to [0.0, 1.0]
        norm = entropy / math.log2(125)
        return min(max(norm, 0.0), 1.0)

    def process_telemetry(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Processes incoming Sentinel frame and executes agentic triage"""
        now = time.time()
        self.latest_telemetry = data

        deauth_count = data.get("deauth_count", 0)
        bins = data.get("nrf_bins", [])
        target_bssid = data.get("target_bssid", "UNKNOWN")
        unique_macs = data.get("unique_source_macs", 0)

        # 1. Update sliding window & calculate velocity V_deauth(t)
        self.deauth_history.append((now, deauth_count))
        # Keep only entries within sliding window
        while self.deauth_history and (now - self.deauth_history[0][0]) > self.window_duration_s:
            self.deauth_history.popleft()

        total_window_deauth = sum(cnt for _, cnt in self.deauth_history)
        dt = (self.deauth_history[-1][0] - self.deauth_history[0][0]) if len(self.deauth_history) > 1 else 0.2
        if dt < 0.05:
            dt = 0.2
        self.current_velocity = total_window_deauth / dt

        # 2. Spectral Entropy H(X)
        if bins and len(bins) == 125:
            self.current_entropy = self.calculate_entropy_from_bins(bins)
        else:
            self.current_entropy = data.get("spectral_entropy", 0.0)

        # 3. Target MAC Dispersion Ratio: D_mac = Distinct_Source_MACs / Total_Deauth_Frames
        if deauth_count > 0:
            self.current_dispersion = max(0.01, min(1.0, unique_macs / float(deauth_count)))
        else:
            self.current_dispersion = 1.0

        # 4. State Machine / Triage & Reasoning per PRD Section 8
        if self.state == "MONITORING":
            if self.current_velocity > self.VELOCITY_THRESHOLD_FPS or self.current_entropy > self.ENTROPY_THRESHOLD:
                self.attack_onset_time = now
                self.state = "TRIAGE"
                self.log(f"Anomaly detected! V_deauth={self.current_velocity:.1f} fps, Entropy={self.current_entropy:.3f}. Entering TRIAGE & REASONING.")

        if self.state == "TRIAGE":
            self.evaluate_triage(data, now)

        return self.get_state_summary()

    def evaluate_triage(self, data: Dict[str, Any], now: float):
        """Chain-of-thought analysis distinguishing benign noise from adversarial attack"""
        # Case A: Benign Congestion (Bluetooth / Microwave)
        # High carrier energy or localized bursts, but deauth velocity near zero
        if self.current_entropy > self.ENTROPY_THRESHOLD and self.current_velocity <= self.BENIGN_DEAUTH_MAX:
            self.state = "BENIGN"
            self.log(f"Spectral entropy elevated ({self.current_entropy:.3f}) but deauth velocity == {self.current_velocity:.1f} fps.")
            self.log("Classifying anomaly as: BENIGN 2.4 GHz CONGESTION (Bluetooth / Microwave).")
            self.log("Suppressed alarms. Primary Wi-Fi link maintained.")
            # Auto-return to monitoring after short observation
            return

        # Case B: Layer-2 Spoofing Attack (Deauth Flood)
        if self.current_velocity > self.VELOCITY_THRESHOLD_FPS:
            self.log(f"Deauth arrival velocity spiked to {self.current_velocity:.1f} fps (threshold: {self.VELOCITY_THRESHOLD_FPS}).")
            self.log(f"Target BSSID: {data.get('target_bssid')} | MAC Dispersion: {self.current_dispersion:.2f} (Single rogue injector).")
            self.execute_mitigation("LAYER-2 DEAUTH / DISASSOC FLOOD ATTACK", now)
            return

        # Case C: Broadband Layer-1 Physical RF Jamming
        if self.current_entropy > 0.90 and data.get("nrf_energy_ratio", 0) > 0.60:
            self.log(f"Broadband noise floor saturated across 125 channels! Entropy: {self.current_entropy:.3f}, Energy Ratio: {data.get('nrf_energy_ratio', 0):.2f}.")
            self.execute_mitigation("BROADBAND 2.4 GHz RF CARRIER JAMMING", now)
            return

    def execute_mitigation(self, attack_name: str, now: float):
        """Executes hardware-in-the-loop mitigation actions"""
        self.mitigation_time = now
        latency_ms = (self.mitigation_time - (self.attack_onset_time or now)) * 1000.0

        self.log(f"ADVERSARIAL ATTACK VERIFIED -> [{attack_name}]. Initiating autonomous mitigation:")
        
        # Action 1: Spin up Sub-GHz 433 MHz failover channel
        self.subghz_failover_active = True
        self.log(">> Action 1: Dispatched 433 MHz Out-of-Band (OOB) Failover Command.")

        # Action 2: Trip Hardware Air-Gap Relay
        self.airgap_relay_tripped = True
        self.log(">> Action 2: Tripped Physical Air-Gap Relay (Galvanic circuit isolation).")

        # Action 3: Switch OLED status to Alert
        self.log(">> Action 3: Commanded Mission Node OLED -> [ALERT: AIR-GAP ENGAGED].")

        # Action 4: Emit Tamper-evident forensic incident report
        report = generate_incident_report(
            incident_type=attack_name,
            onset_timestamp=self.attack_onset_time or now,
            mitigation_timestamp=self.mitigation_time,
            deauth_velocity=self.current_velocity,
            spectral_entropy=self.current_entropy,
            target_bssid=self.latest_telemetry.get("target_bssid", "00:00:00:00:00:00"),
            source_mac_count=self.latest_telemetry.get("unique_source_macs", 1),
            action_taken=f"Hardware relay tripped in {latency_ms:.1f}ms; 433MHz failover locked",
            evidence_telemetry=self.latest_telemetry
        )
        self.incident_reports.append(report)
        self.log(f">> Action 4: Forensic incident report generated -> Hash: {report['sha256_hash'][:16]}... (T_mitigation = {latency_ms:.1f} ms)")

        self.state = "AIRGAPPED_OOB_SURVIVAL"

    def reset_to_nominal(self):
        """Restores system to nominal 2.4 GHz monitoring state"""
        self.state = "MONITORING"
        self.subghz_failover_active = False
        self.airgap_relay_tripped = False
        self.attack_onset_time = None
        self.mitigation_time = None
        self.deauth_history.clear()
        self.log("System restored to NOMINAL state. Air-gap relay re-closed. 2.4 GHz uplink active.")

    def get_state_summary(self) -> Dict[str, Any]:
        return {
            "state": self.state,
            "spectral_entropy": round(self.current_entropy, 4),
            "deauth_velocity": round(self.current_velocity, 1),
            "mac_dispersion": round(self.current_dispersion, 3),
            "subghz_failover": self.subghz_failover_active,
            "airgap_relay": self.airgap_relay_tripped,
            "latest_bssid": self.latest_telemetry.get("target_bssid", "NONE"),
            "data_count": self.latest_telemetry.get("data_count", 0),
            "deauth_count": self.latest_telemetry.get("deauth_count", 0),
            "beacon_count": self.latest_telemetry.get("beacon_count", 0),
            "nrf_energy_ratio": self.latest_telemetry.get("nrf_energy_ratio", 0.0),
            "nrf_present": self.latest_telemetry.get("nrf_present", False)
        }
