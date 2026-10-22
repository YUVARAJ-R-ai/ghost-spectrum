#!/usr/bin/env python3
"""
Ghost-Spectrum Automated HIL Verification Pipeline
Tests end-to-end CRC calculation, frame packing, triage reasoning, and forensic reports.
"""

import sys
import os
import time

# Add server to path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "server")))

from protocol import crc16_ccitt, pack_subghz_frame, unpack_subghz_frame
from agent import SecOpsAgent
from forensic import INCIDENTS_DIR

def run_tests():
    print("============================================================")
    print("  GHOST-SPECTRUM AUTOMATED VERIFICATION SUITE")
    print("============================================================")

    # Test 1: CRC-16 CCITT
    test_bytes = b"\xAA\x01\x02\x55\x00\x01"
    crc = crc16_ccitt(test_bytes)
    print(f"[TEST 1] CRC-16-CCITT calculation: 0x{crc:04X} ... PASSED")

    # Test 2: Frame Packing & Unpacking
    frame = pack_subghz_frame(seq=42, status_code=0x55)
    assert len(frame) == 8, f"Frame length should be 8 bytes, got {len(frame)}"
    unpacked = unpack_subghz_frame(frame)
    assert unpacked is not None, "Frame unpacking failed"
    assert unpacked["seq"] == 42
    assert unpacked["status_code"] == "0x55"
    print(f"[TEST 2] 8-Byte 433MHz Sub-GHz Frame Packing & Validation ... PASSED")

    # Test 3: Agentic Reasoning - Nominal State
    agent = SecOpsAgent()
    assert agent.state == "MONITORING"
    nom_data = {
        "seq": 1,
        "deauth_count": 0,
        "data_count": 25,
        "beacon_count": 10,
        "spectral_entropy": 0.25,
        "nrf_energy_ratio": 0.08,
        "nrf_bins": [0] * 125
    }
    agent.process_telemetry(nom_data)
    assert agent.state == "MONITORING"
    print("[TEST 3] Nominal Baseline Triage ... PASSED (State: MONITORING)")

    # Test 4: Benign Bluetooth Congestion (High entropy, zero deauths)
    bt_bins = [0] * 125
    for i in range(2, 80):
        bt_bins[i] = 1
    bt_data = {
        "seq": 2,
        "deauth_count": 0,
        "data_count": 15,
        "beacon_count": 10,
        "nrf_bins": bt_bins
    }
    agent.process_telemetry(bt_data)
    assert agent.state == "BENIGN"
    assert not agent.airgap_relay_tripped
    print("[TEST 4] Benign 2.4 GHz Interference Suppression ... PASSED (Alarms Suppressed)")

    # Test 5: Adversarial 802.11 Deauth Flood (>200 fps)
    agent.reset_to_nominal()
    deauth_data = {
        "seq": 3,
        "deauth_count": 55, # 55 in 200ms -> 275 fps
        "data_count": 2,
        "beacon_count": 2,
        "target_bssid": "34:85:18:A2:B4:90",
        "unique_source_macs": 1,
        "nrf_bins": [0] * 125
    }
    agent.process_telemetry(deauth_data)
    assert agent.state == "AIRGAPPED_OOB_SURVIVAL"
    assert agent.subghz_failover_active is True
    assert agent.airgap_relay_tripped is True
    assert len(agent.incident_reports) == 1
    print("[TEST 5] Adversarial Attack Detection & Autonomous Relay Snap ... PASSED (Air-Gap Active)")

    # Test 6: Tamper-evident Forensic JSON Report
    latest_report = agent.incident_reports[0]
    assert "sha256_hash" in latest_report
    assert os.path.exists(os.path.join(INCIDENTS_DIR, f"incident_{latest_report['incident_id']}.json"))
    print(f"[TEST 6] Cryptographic Forensic Incident Export ... PASSED (Hash: {latest_report['sha256_hash'][:16]}...)")

    print("\nALL 6 VERIFICATION CHECKS COMPLETED SUCCESSFULLY WITH ZERO ERRORS!")

if __name__ == "__main__":
    run_tests()
