"""Unit tests for Phase 2 hub features: authoritative state, UDP radio ingestion, heartbeats, and commands."""
import os
import sys
import time
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))
import app


class TestPhase2Hub(unittest.TestCase):
    def setUp(self):
        self.hub = app.Hub()
        self.hub.send_cmd = lambda c: {"sent": True, "status": "sent", "cmd": c.get("cmd")}

    def test_heartbeat_separation(self):
        """Gateway heartbeats must update gateway health but NEVER inflate sensor readings."""
        initial_readings = len(self.hub.seen)
        hb = {
            "n": "B",
            "hb": 1,
            "wifi": 1,
            "ip": "192.168.43.105",
            "rssi": -55,
            "ok": 12,
            "bad": 1,
            "dup": 0,
            "last_rx_age_ms": 100
        }
        self.hub.on_gateway_heartbeat(hb, source="udp")
        self.assertEqual(len(self.hub.seen), initial_readings, "Heartbeat must not add a sensor reading")
        self.assertTrue(self.hub.gateway["online"])
        self.assertEqual(self.hub.gateway["ok"], 12)
        self.assertEqual(self.hub.gateway["bad"], 1)

    def test_node_b_radio_ingest(self):
        """Node B forwarded radio packets must be ingested as radio path telemetry."""
        pkt = {
            "n": "B",
            "transport": "433MHz",
            "seq": 101,
            "sensor": 2400,
            "rssi": -65,
            "loss": 0,
            "rtt": 25,
            "reason": 0,
            "ch": 6,
            "mode": "radio",
            "connected": 0,
            "frames_ok": 1,
            "frames_bad": 0,
            "frames_dup": 0
        }
        self.hub.ingest(pkt, "radio")
        self.assertIn(101, self.hub.seen)
        self.assertEqual(self.hub.seen[101]["paths"], {"radio"})
        self.assertEqual(self.hub.last_pkt["path"], "radio")

    def test_deduplication_between_wifi_and_radio(self):
        """Same sequence arriving on both Wi-Fi and Radio must be merged into one reading."""
        pkt_wifi = {
            "n": "A",
            "seq": 200,
            "sensor": 1500,
            "rssi": -60,
            "rtt": 20,
            "loss": 0,
            "reason": 0,
            "ch": 6,
            "mode": "wifi",
            "why": "nominal"
        }
        self.hub.ingest(pkt_wifi, "wifi")
        self.assertEqual(len(self.hub.seen), 1)
        self.assertEqual(self.hub.seen[200]["paths"], {"wifi"})

        # Retransmission or delayed arrival over radio
        pkt_radio = {
            "n": "B",
            "transport": "433MHz",
            "seq": 200,
            "sensor": 1500,
            "rssi": -60,
            "loss": 0,
            "rtt": 20,
            "reason": 0,
            "ch": 6,
            "mode": "radio",
            "why": "fallback",
            "connected": 1
        }
        self.hub.ingest(pkt_radio, "radio")
        self.assertEqual(len(self.hub.seen), 1, "Reading count must not increment on duplicate seq")
        self.assertEqual(self.hub.seen[200]["paths"], {"wifi", "radio"})

    def test_authoritative_state_derivation(self):
        """Test state machine transitions based on firmware reports and link health."""
        # Active Wi-Fi
        pkt_active = {
            "n": "A", "seq": 1, "sensor": 1000, "rssi": -50, "rtt": 20, "loss": 0,
            "reason": 0, "ch": 6, "mode": "wifi", "why": "nominal"
        }
        self.hub.ingest(pkt_active, "wifi")
        self.assertEqual(self.hub.derive_network_state(), "WIFI_ACTIVE")

        # Degraded Wi-Fi (high loss and RTT)
        pkt_degraded = {
            "n": "A", "seq": 2, "sensor": 1000, "rssi": -85, "rtt": 250, "loss": 30,
            "reason": 0, "ch": 6, "mode": "wifi", "why": "fading"
        }
        self.hub.ingest(pkt_degraded, "wifi")
        self.assertEqual(self.hub.derive_network_state(), "WIFI_DEGRADED")

        # Radio Active
        pkt_radio = {
            "n": "B", "seq": 3, "sensor": 1000, "rssi": -88, "rtt": 250, "loss": 50,
            "reason": 200, "ch": 6, "mode": "radio", "why": "WIFI_LOST"
        }
        self.hub.ingest(pkt_radio, "radio")
        self.assertEqual(self.hub.derive_network_state(), "RADIO_ACTIVE")

    def test_cmd_acknowledgement(self):
        """Command acknowledgement updates pending command state to confirmed."""
        self.hub.pending_cmd = {"cmd": "wifi", "sent_at": time.time(), "status": "sent"}
        ack_pkt = {"n": "A", "cmd_ack": "wifi", "status": "ok", "mode": "wifi"}
        self.hub.on_cmd_ack(ack_pkt)
        self.assertEqual(self.hub.pending_cmd["status"], "confirmed")
        self.assertEqual(self.hub.last_cmd_ack["status"], "ok")

    def test_send_cmd_unreachable_when_wifi_down(self):
        """When Node A is disconnected from Wi-Fi, commands must be rejected with unreachable status."""
        real_hub = app.Hub()
        res = real_hub.send_cmd({"cmd": "wifi"})
        self.assertFalse(res["sent"])
        self.assertEqual(res["status"], "unreachable")
        self.assertEqual(real_hub.pending_cmd["status"], "unreachable")

    def test_send_cmd_dispatch_when_reachable(self):
        """When Node A Wi-Fi is reachable, commands are serialized and sent over UDP."""
        real_hub = app.Hub()
        sent_payloads = []
        class MockTransport:
            def sendto(self, data, addr):
                sent_payloads.append((data, addr))

        real_hub.transport = MockTransport()
        real_hub.node_addr = ("192.168.4.10", 4210)
        real_hub.last_wifi = time.time()

        res = real_hub.send_cmd({"cmd": "radio"})
        self.assertTrue(res["sent"])
        self.assertEqual(res["status"], "sent")
        self.assertEqual(len(sent_payloads), 1)
        self.assertIn(b'"cmd": "radio"', sent_payloads[0][0])

    def test_cluster_node1_sensor_ingest(self):
        """Node 1 (Sensor ESP8266) telemetry must be ingested cleanly."""
        pkt = {
            "n": "1",
            "node_id": "NODE_1_SENSOR",
            "type": "sensor",
            "seq": 201,
            "sensor": 480,
            "rssi": -58,
            "rtt": 14.5,
            "loss": 0,
            "reason": 0,
            "mode": "wifi",
            "ml_pred": "NOMINAL",
            "ip": "192.168.43.101"
        }
        self.hub.ingest(pkt, "wifi")
        self.assertIn(201, self.hub.seen)
        self.assertEqual(self.hub.seen[201]["sensor"], 480)
        self.assertEqual(self.hub.last_pkt["ml_pred"], "NOMINAL")

    def test_cluster_node2_supervisor_heartbeat(self):
        """Node 2 (Supervisor ESP8266) heartbeat must update health and alert."""
        hb = {
            "n": "2",
            "node_id": "NODE_2_SUPERVISOR",
            "type": "supervisor",
            "hb": 1,
            "health": 98,
            "alert": "NOMINAL",
            "ok": 1,
            "bad": 0,
            "dup": 0,
            "rssi": -52,
            "ip": "192.168.43.102"
        }
        self.hub.on_gateway_heartbeat(hb, source="udp")
        self.assertTrue(self.hub.gateway["online"])
        self.assertEqual(self.hub.gateway["health"], 98)
        self.assertEqual(self.hub.gateway["alert"], "NOMINAL")
        self.assertEqual(self.hub.gateway["ip"], "192.168.43.102")

    def test_cluster_node3_sentinel_fault_injection(self):
        """Node 3 (Sentinel ESP32) anomaly transmission triggers sentinel fault state."""
        sentinel_pkt = {
            "n": "3",
            "node_id": "NODE_3_SENTINEL",
            "type": "sentinel",
            "seq": 45,
            "fault": 1,
            "anomaly": "CHANNEL_JAMMING",
            "rssi": -50,
            "ch": 6,
            "ip": "192.168.43.103"
        }
        self.hub.on_sentinel_udp(sentinel_pkt)
        self.assertTrue(self.hub.sentinel["online"])
        self.assertEqual(self.hub.sentinel["fault"], 1)
        self.assertEqual(self.hub.sentinel["anomaly"], "CHANNEL_JAMMING")
        self.assertEqual(self.hub.air["deauth_per_s"], 125.0)


if __name__ == "__main__":
    unittest.main()

