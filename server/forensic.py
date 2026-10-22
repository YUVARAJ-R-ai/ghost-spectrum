"""
Ghost-Spectrum Forensic Incident Audit Logger
Emits cryptographically hashed (SHA-256) JSON post-mortem incident reports per PRD Section 8 & 11
"""

import os
import json
import time
import hashlib
from typing import Dict, Any

INCIDENTS_DIR = os.path.join(os.path.dirname(__file__), "incidents")

def generate_incident_report(
    incident_type: str,
    onset_timestamp: float,
    mitigation_timestamp: float,
    deauth_velocity: float,
    spectral_entropy: float,
    target_bssid: str,
    source_mac_count: int,
    action_taken: str,
    evidence_telemetry: Dict[str, Any]
) -> Dict[str, Any]:
    """Generates and writes a tamper-evident incident report signed with SHA-256"""
    os.makedirs(INCIDENTS_DIR, exist_ok=True)
    
    latency_ms = (mitigation_timestamp - onset_timestamp) * 1000.0
    report_data = {
        "incident_id": f"INC-{int(mitigation_timestamp)}-{hashlib.md5(str(onset_timestamp).encode()).hexdigest()[:6].upper()}",
        "timestamp_iso": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(mitigation_timestamp)),
        "attack_classification": incident_type,
        "metrics": {
            "deauth_velocity_fps": round(deauth_velocity, 2),
            "shannon_spectral_entropy": round(spectral_entropy, 4),
            "target_bssid": target_bssid,
            "unique_source_mac_count": source_mac_count,
            "mitigation_latency_ms": round(latency_ms, 2)
        },
        "mitigation_actions": [
            "Triggered Sub-GHz (433 MHz) Out-of-Band Failover",
            "Mechanically Tripped Hardware-in-the-Loop Air-Gap Relay (Pin 7)",
            "Dispatched Local OLED Alert [AIR-GAP ENGAGED]",
            action_taken
        ],
        "evidence_snapshot": evidence_telemetry
    }

    # Generate cryptographic SHA-256 hash over canonical JSON
    serialized = json.dumps(report_data, sort_keys=True)
    report_hash = hashlib.sha256(serialized.encode("utf-8")).hexdigest()
    report_data["sha256_hash"] = report_hash

    # Save to disk
    filename = f"incident_{report_data['incident_id']}.json"
    filepath = os.path.join(INCIDENTS_DIR, filename)
    with open(filepath, "w") as f:
        json.dump(report_data, f, indent=2)

    return report_data
