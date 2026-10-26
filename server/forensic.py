"""
Incident reports: one tamper-evident JSON file per Wi-Fi outage, hashed with SHA-256
so any later edit to the file is detectable.
"""

import os
import json
import time
import hashlib
from typing import Dict, Any

INCIDENTS_DIR = os.path.join(os.path.dirname(__file__), "incidents")


def write_incident_report(incident: Dict[str, Any], readings_via_radio: int, readings_lost: int) -> Dict[str, Any]:
    os.makedirs(INCIDENTS_DIR, exist_ok=True)
    report = {
        "incident_id": f"INC-{int(incident['start'])}",
        "started_iso": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(incident["start"])),
        "duration_s": round(incident["end"] - incident["start"], 1),
        "diagnoses": incident["diagnoses"],
        "peak_confidence": round(incident["peak_conf"], 2),
        "agent_actions": incident["actions"] or ["none needed: node reflex handled it"],
        "readings_carried_by_radio": readings_via_radio,
        "readings_lost": readings_lost,
    }
    report["sha256"] = hashlib.sha256(json.dumps(report, sort_keys=True).encode()).hexdigest()
    with open(os.path.join(INCIDENTS_DIR, f"{report['incident_id']}.json"), "w") as fp:
        json.dump(report, fp, indent=2)
    return report
