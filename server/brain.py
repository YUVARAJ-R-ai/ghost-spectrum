"""
The link doctor: turns Node A's link-health numbers into a diagnosis (trained
model if server/model.joblib exists, hand rules otherwise) and an agent that
acts on the diagnosis and explains every decision.
"""

import os
import time
from collections import deque
from typing import Any, Callable, Dict, List, Optional

CLASSES = ["nominal", "fading", "congestion", "ap_down", "auth_fail"]

FEATURES = [
    "rssi_now", "rssi_mean", "rssi_min", "rssi_slope",
    "rtt_mean", "rtt_max", "loss_now", "loss_mean",
    "connected_frac", "reason_auth", "reason_no_ap", "reason_other",
]

# ESP32 Wi-Fi disconnect reason codes (esp_wifi_types.h)
AUTH_REASONS = {2, 15, 202, 204}        # auth expired, 4-way handshake timeout, auth fail, handshake timeout
NO_AP_REASONS = {200, 201}              # beacon timeout, no AP found
REASON_NAMES = {
    0: "none", 2: "auth expired", 3: "kicked by router", 4: "assoc expired", 8: "left network",
    15: "4-way handshake timeout (wrong password?)", 200: "beacon timeout (router silent)",
    201: "no AP found", 202: "auth failed", 203: "assoc failed", 204: "handshake timeout",
    205: "connection failed",
}
DROP_RSSI = -88   # roughly where the ESP32 loses the link

WINDOW_S = 5.0
MODEL_PATH = os.path.join(os.path.dirname(__file__), "model.joblib")


def slope(ts: List[float], ys: List[float]) -> float:
    """Least-squares slope (units per second)."""
    n = len(ts)
    if n < 3:
        return 0.0
    mt, my = sum(ts) / n, sum(ys) / n
    den = sum((t - mt) ** 2 for t in ts)
    return sum((t - mt) * (y - my) for t, y in zip(ts, ys)) / den if den else 0.0


def extract_features(window: List[Dict[str, Any]]) -> Dict[str, float]:
    """window: Node A packets (dicts with t, rssi, rtt, loss, reason, connected), oldest first."""
    ts = [p["t"] for p in window]
    rssi = [p["rssi"] for p in window]
    rtt = [p["rtt"] for p in window]
    loss = [p["loss"] for p in window]
    reasons = {p["reason"] for p in window} - {0}
    return {
        "rssi_now": rssi[-1],
        "rssi_mean": sum(rssi) / len(rssi),
        "rssi_min": min(rssi),
        "rssi_slope": slope(ts, rssi),
        "rtt_mean": sum(rtt) / len(rtt),
        "rtt_max": max(rtt),
        "loss_now": loss[-1],
        "loss_mean": sum(loss) / len(loss),
        "connected_frac": sum(p["connected"] for p in window) / len(window),
        "reason_auth": float(bool(reasons & AUTH_REASONS)),
        "reason_no_ap": float(bool(reasons & NO_AP_REASONS)),
        "reason_other": float(bool(reasons - AUTH_REASONS - NO_AP_REASONS)),
    }


def rule_diagnose(f: Dict[str, float]) -> Dict[str, float]:
    """Hand-written fallback used until a model has been trained."""
    if f["reason_auth"] and f["connected_frac"] < 1:
        label = "auth_fail"
    elif f["connected_frac"] < 0.5 or f["reason_no_ap"]:
        label = "ap_down"
    elif f["rssi_mean"] < -80 or (f["rssi_slope"] < -1.5 and f["rssi_now"] < -70):
        label = "fading"
    elif f["loss_mean"] > 20 or f["rtt_mean"] > 150:
        label = "congestion"
    else:
        label = "nominal"
    return {c: (0.85 if c == label else 0.15 / (len(CLASSES) - 1)) for c in CLASSES}


class Diagnoser:
    def __init__(self, model_path: str = MODEL_PATH):
        self.bundle: Optional[Dict[str, Any]] = None
        if os.path.exists(model_path):
            import joblib
            self.bundle = joblib.load(model_path)

    @property
    def info(self) -> Dict[str, Any]:
        if not self.bundle:
            return {"source": "rules", "detail": "no trained model yet: run tools/train.py"}
        b = self.bundle
        return {"source": "model", "detail": b["name"], "accuracy": b["accuracy"],
                "samples": b["samples"], "importances": b["importances"]}

    def diagnose(self, f: Dict[str, float]) -> Dict[str, float]:
        if not self.bundle:
            return rule_diagnose(f)
        model = self.bundle["model"]
        probs = model.predict_proba([[f[k] for k in self.bundle["features"]]])[0]
        out = {c: 0.0 for c in CLASSES}
        out.update({c: float(p) for c, p in zip(model.classes_, probs)})
        return out


class Agent:
    """Acts on diagnoses. send_cmd(dict) reaches Node A over Wi-Fi (only works while Wi-Fi is up)."""

    def __init__(self, send_cmd: Callable[[Dict[str, Any]], bool], on_incident_closed: Callable[[Dict[str, Any]], None]):
        self.send_cmd = send_cmd
        self.on_incident_closed = on_incident_closed
        self.log: deque = deque(maxlen=30)
        self.recent: deque = deque(maxlen=3)
        self.held = "nominal"
        self.forced_radio = False
        self.slow_rate = False
        self.nominal_since: Optional[float] = None
        self.incident: Optional[Dict[str, Any]] = None
        self.alert: Optional[str] = None

    def note(self, saw: str, think: str, did: str):
        self.log.appendleft({"t": time.time(), "saw": saw, "think": think, "did": did})

    def step(self, probs: Dict[str, float], f: Dict[str, float], node_mode: str, air: Dict[str, Any]):
        label = max(probs, key=probs.get)
        conf = probs[label]
        self.recent.append(label if conf >= 0.5 else "unsure")
        # Act only on a diagnosis seen twice in the last three windows (~1 s) to ignore blips
        stable = label if conf >= 0.5 and list(self.recent).count(label) >= 2 else self.held
        changed = stable != self.held
        self.held = stable
        now = time.time()
        if stable != "nominal":
            self.nominal_since = None
        elif self.nominal_since is None:
            self.nominal_since = now

        saw = (f"RSSI {f['rssi_now']:.0f} dBm ({f['rssi_slope']:+.1f} dB/s), ping {f['rtt_mean']:.0f} ms, "
               f"loss {f['loss_mean']:.0f}%")

        if air.get("deauth_per_s", 0) > 20 and self.alert != "deauth":
            self.alert = "deauth"
            self.note(f"Air watcher sees {air['deauth_per_s']:.0f} deauth frames/s on ch {air.get('ch')}",
                      "Someone is forcing devices off this network: an attack, not a fault",
                      "Flagged for a human; node will ride it out on radio")

        if stable != "nominal":
            self._open_incident(stable, conf, node_mode)

        if stable == "fading" and not self.forced_radio:
            ttd = (f["rssi_now"] - DROP_RSSI) / -f["rssi_slope"] if f["rssi_slope"] < -0.3 else None
            if self.send_cmd({"cmd": "radio"}):
                self.forced_radio = True
                self._action("pre-emptive switch to 433 MHz")
                when = f"link likely to drop in ~{ttd:.0f} s" if ttd and ttd < 60 else "link heading for the drop zone"
                self.note(saw, f"Signal is fading ({conf:.0%} sure): {when}",
                          "Moved data onto 433 MHz radio before Wi-Fi breaks (make-before-break)")
        elif stable == "congestion" and not self.slow_rate and changed:
            if self.send_cmd({"cmd": "rate", "ms": 1000}):
                self.slow_rate = True
                self._action("halved send rate")
                self.note(saw, f"Wi-Fi is up but choked ({conf:.0%} sure); the full stream would swamp the slow radio",
                          "Stayed on Wi-Fi and halved the send rate; any reading Wi-Fi drops is resent over radio")
        elif stable == "ap_down" and changed:
            self.note(saw, f"Router is gone, not just weak ({conf:.0%} sure)",
                      "Node is on 433 MHz radio; it will rejoin Wi-Fi by itself when the router is back")
        elif stable == "auth_fail" and changed:
            self.alert = "auth"
            self.note(saw, f"Router is rejecting the password ({conf:.0%} sure). Retrying will never fix this",
                      "Data stays on radio; raised an alert: a human must update the Wi-Fi credentials")
        elif stable == "nominal" and self.nominal_since and now - self.nominal_since >= 4:
            undo = []
            if self.forced_radio and self.send_cmd({"cmd": "wifi"}):
                self.forced_radio = False
                undo.append("Released the node back to Wi-Fi")
            if self.slow_rate and self.send_cmd({"cmd": "rate", "ms": 500}):
                self.slow_rate = False
                undo.append("Restored full send rate")
            if self.forced_radio or self.slow_rate:
                return  # command didn't reach the node; try again on the next window
            self.nominal_since = float("inf")  # act once per healthy stretch
            self.alert = None
            if undo or self.incident:
                self.note(saw, "Link has been healthy for 4 s", "; ".join(undo) or "Closed the incident")
            self._close_incident()

    def _open_incident(self, label: str, conf: float, node_mode: str):
        if not self.incident:
            self.incident = {"start": time.time(), "diagnoses": [], "actions": [], "peak_conf": 0.0}
        if label not in self.incident["diagnoses"]:
            self.incident["diagnoses"].append(label)
        self.incident["peak_conf"] = max(self.incident["peak_conf"], conf)

    def _action(self, what: str):
        if self.incident is not None:
            self.incident["actions"].append(what)

    def _close_incident(self):
        if self.incident:
            self.incident["end"] = time.time()
            self.on_incident_closed(self.incident)
            self.incident = None
