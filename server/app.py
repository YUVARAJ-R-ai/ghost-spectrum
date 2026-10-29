"""
Laptop hub: receives Node A over Wi-Fi (UDP) and over 433 MHz radio (via Node B
gateway over UDP and USB Serial), merges both paths into one reading stream,
tracks authoritative link states and command lifecycle, runs the link doctor
agent, records labelled training data, and serves the dashboard.
"""

import asyncio
import csv
import glob
import json
import os
import threading
import time
from collections import deque
from contextlib import asynccontextmanager
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from brain import CLASSES, FEATURES, REASON_NAMES, WINDOW_S, Agent, Diagnoser, extract_features
from forensic import INCIDENTS_DIR, write_incident_report

UDP_PORT = int(os.environ.get("UDP_PORT", 4210))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
WEB_DIR = os.path.join(ROOT, "web")
DIST_DIR = os.path.join(WEB_DIR, "dist")   # the built 3D dashboard (frontend/ -> npm run build)
DATA_CSV = os.path.join(ROOT, "data", "train.csv")
LOST_GRACE_S = 3.0   # a missing reading only counts as lost after this long (radio can lag)


class Hub:
    def __init__(self):
        self.diag = Diagnoser()
        self.agent = Agent(self.send_cmd, self.incident_closed)
        self.transport: Optional[asyncio.DatagramTransport] = None
        self.node_addr = None
        self.start_time = time.time()
        self.last_wifi = self.last_radio = 0.0
        self.wifi_count = 0
        self.radio_count = 0
        self.last_mode = None
        self.last_recovery_time = None
        self.pending_cmd: Optional[Dict[str, Any]] = None
        self.last_cmd_ack: Optional[Dict[str, Any]] = None
        self.events: deque = deque(maxlen=200)

        self.gateway: Dict[str, Any] = {
            "port": None, "last": 0.0, "online": False,
            "ok": 0, "bad": 0, "dup": 0, "transport": "none", "ip": None
        }
        self.sentinel: Dict[str, Any] = {"port": None, "last": 0.0, "serial": None}
        self.air: Dict[str, Any] = {}
        self.label: Optional[str] = None
        self.session = 0
        self.rows = sum(1 for _ in open(DATA_CSV)) - 1 if os.path.exists(DATA_CSV) else 0
        self.reports = deque(maxlen=10)
        self.reset_run()
        self.log_event("BOOT", "Hub service initialized", "HUB")

    def reset_run(self):
        self.window: deque = deque()
        self.seen: Dict[int, Dict[str, Any]] = {}
        self.pending: Dict[int, float] = {}      # missing seq -> when we noticed the gap
        self.max_seq: Optional[int] = None
        self.last_pkt: Dict[str, Any] = {}
        self.features: Dict[str, float] = {}
        self.probs: Dict[str, float] = {}

    def log_event(self, kind: str, detail: str, source: str = "HUB"):
        event = {
            "id": f"ev-{len(self.events) + 1}",
            "t": round(time.time(), 3),
            "kind": kind,
            "detail": detail,
            "source": source
        }
        self.events.appendleft(event)

    # ---------- ingest ----------
    def ingest(self, pkt: Dict[str, Any], path: str):
        now = time.time()
        seq = int(pkt["seq"])
        norm_path = "wifi" if path in ("wifi", "NODE_A_WIFI") else "radio"
        source_tag = "NODE_A_WIFI" if norm_path == "wifi" else "NODE_B_RADIO"

        if norm_path == "wifi":
            self.last_wifi = now
            self.wifi_count += 1
        else:
            self.last_radio = now
            self.radio_count += 1
            if pkt.get("mode") != "radio" and seq in self.seen:
                return  # standby beacon for a reading Wi-Fi already delivered

        if self.max_seq is not None and seq < self.max_seq - 50:
            self.reset_run()  # node rebooted
            self.log_event("MODE_CHANGED", "Node reboot detected (sequence reset)", source_tag)

        # Detect mode changes
        new_mode = pkt.get("mode", "wifi")
        why = pkt.get("why", "")
        if self.last_mode is not None and new_mode != self.last_mode:
            if new_mode == "radio":
                reason = "MANUAL_BUTTON" if "button" in why.lower() else ("WIFI_LOST" if "lost" in why.lower() else "ACK_TIMEOUT")
                self.log_event("MODE_CHANGED", f"Node A switched to RADIO ({why or reason})", source_tag)
            else:
                self.last_recovery_time = now
                self.log_event("WIFI_RECOVERY_CONFIRMED", "Node A recovered to WI-FI", source_tag)
        self.last_mode = new_mode

        if seq in self.seen:
            self.seen[seq]["paths"].add(norm_path)
            return

        self.pending.pop(seq, None)
        if self.max_seq is not None:
            for gap in range(self.max_seq + 1, seq):
                self.pending[gap] = now
        self.max_seq = seq if self.max_seq is None else max(self.max_seq, seq)
        self.seen[seq] = {"t": now, "sensor": pkt.get("sensor", 0), "paths": {norm_path}}
        if len(self.seen) > 5000:
            del self.seen[min(self.seen)]

        p = {
            "t": now,
            "seq": seq,
            "rssi": pkt.get("rssi", -60),
            "rtt": pkt.get("rtt", 18.0),
            "loss": pkt.get("loss", 0),
            "reason": pkt.get("reason", 0),
            "connected": 1 if norm_path == "wifi" else int(pkt.get("connected", 0))
        }
        self.last_pkt = {**pkt, "path": norm_path, "source": source_tag, "t": now}
        self.window.append(p)
        while self.window and now - self.window[0]["t"] > WINDOW_S:
            self.window.popleft()
        if len(self.window) < 3:
            return

        self.features = extract_features(list(self.window))
        self.probs = self.diag.diagnose(self.features)
        self.agent.step(self.probs, self.features, pkt.get("mode", "wifi"), self.air)
        if self.label:
            self.record_row()
        if self.sentinel["serial"] and pkt.get("ch") and pkt["ch"] != self.air.get("ch"):
            try:
                self.sentinel["serial"].write(f"CH:{pkt['ch']}\n".encode())  # watch the hotspot's channel
            except Exception:
                pass

    def record_row(self):
        os.makedirs(os.path.dirname(DATA_CSV), exist_ok=True)
        new = not os.path.exists(DATA_CSV)
        with open(DATA_CSV, "a", newline="") as fp:
            w = csv.writer(fp)
            if new:
                w.writerow(["session", "label", *FEATURES])
            w.writerow([self.session, self.label, *[round(self.features[k], 3) for k in FEATURES]])
        self.rows += 1

    def lost(self, since: float = 0.0) -> int:
        now = time.time()
        return sum(1 for t in self.pending.values() if t >= since and now - t > LOST_GRACE_S)

    def send_cmd(self, cmd: Dict[str, Any]) -> Dict[str, Any]:
        """Commands ride Wi-Fi; if Wi-Fi is down the node cannot be reached directly."""
        now = time.time()
        cmd_name = cmd.get("cmd")
        is_reachable = bool(self.transport and self.node_addr and (now - self.last_wifi < 3.0))

        if not is_reachable:
            detail = "Node A is unreachable over Wi-Fi. Command cannot reach device directly."
            self.pending_cmd = {
                "cmd": cmd_name,
                "sent_at": now,
                "status": "unreachable",
                "detail": detail
            }
            self.log_event("COMMAND_UNREACHABLE", f"Cannot send '{cmd_name}': Node A Wi-Fi disconnected", "HUB")
            return {"sent": False, "status": "unreachable", "error": detail, "cmd": cmd_name}

        try:
            payload = json.dumps(cmd).encode()
            self.transport.sendto(payload, self.node_addr)
            self.pending_cmd = {
                "cmd": cmd_name,
                "sent_at": now,
                "status": "sent",
                "detail": f"Command '{cmd_name}' transmitted to {self.node_addr[0]}:{self.node_addr[1]}"
            }
            self.log_event("COMMAND_SENT", f"Sent '{cmd_name}' command to Node A", "HUB")
            return {"sent": True, "status": "sent", "cmd": cmd_name}
        except Exception as e:
            self.pending_cmd = {"cmd": cmd_name, "sent_at": now, "status": "failed", "detail": str(e)}
            return {"sent": False, "status": "failed", "error": str(e), "cmd": cmd_name}

    def on_cmd_ack(self, pkt: Dict[str, Any]):
        cmd = pkt.get("cmd_ack")
        status = pkt.get("status")
        mode = pkt.get("mode")
        self.last_cmd_ack = {"cmd": cmd, "status": status, "mode": mode, "t": time.time()}
        if self.pending_cmd and self.pending_cmd.get("cmd") == cmd:
            self.pending_cmd["status"] = "confirmed"
            self.pending_cmd["ack_at"] = time.time()
            self.pending_cmd["ack_data"] = pkt
        self.log_event("COMMAND_CONFIRMED", f"Node A acknowledged '{cmd}' (status: {status}, mode: {mode})", "NODE_A_WIFI")

    def incident_closed(self, inc: Dict[str, Any]):
        radio = sum(1 for r in self.seen.values() if r["t"] >= inc["start"] and r["paths"] == {"radio"})
        self.reports.appendleft(write_incident_report(inc, radio, self.lost(inc["start"])))

    # ---------- gateway telemetry and heartbeats ----------
    def on_gateway_heartbeat(self, d: Dict[str, Any], source: str = "serial"):
        now = time.time()
        self.gateway["last"] = now
        self.gateway["online"] = True
        self.gateway["transport"] = source
        self.gateway["ok"] = d.get("ok", self.gateway.get("ok", 0))
        self.gateway["bad"] = d.get("bad", self.gateway.get("bad", 0))
        self.gateway["dup"] = d.get("dup", self.gateway.get("dup", 0))
        if "health" in d:
            self.gateway["health"] = d["health"]
        if "alert" in d:
            self.gateway["alert"] = d["alert"]
        if "ip" in d:
            self.gateway["ip"] = d["ip"]

    def on_sentinel_udp(self, d: Dict[str, Any]):
        now = time.time()
        self.sentinel["last"] = now
        self.sentinel["online"] = True
        self.sentinel["transport"] = "udp"
        fault = d.get("fault", 0)
        self.sentinel["fault"] = fault
        self.sentinel["anomaly"] = d.get("anomaly", "NOMINAL")
        self.sentinel["rssi"] = d.get("rssi", -60)
        self.sentinel["ch"] = d.get("ch", 6)
        if "ip" in d:
            self.sentinel["ip"] = d["ip"]
        self.air["ch"] = d.get("ch", self.air.get("ch", 6))
        if fault == 1:
            self.air["deauth_per_s"] = 125.0
            self.air["frames_per_s"] = 450.0
            self.log_event("SENTINEL_FAULT_INJECTED", f"Node 3 Sentinel injected {d.get('anomaly', 'ANOMALY')}", "NODE_3_SENTINEL")
        else:
            self.air["deauth_per_s"] = 0.0
            self.air["frames_per_s"] = 40.0

    def on_gateway_line(self, d: Dict[str, Any]):
        now = time.time()
        self.gateway["last"] = now
        self.gateway["online"] = True
        if "hb" in d:
            self.on_gateway_heartbeat(d, source="serial")
        elif "seq" in d:
            self.ingest(d, "radio")

    def on_sentinel_line(self, d: Dict[str, Any]):
        now = time.time()
        if "deauth_count" not in d:
            return
        dt = max((d["timestamp_ms"] - self.air.get("ts_ms", d["timestamp_ms"] - 200)) / 1000, 0.05)
        self.sentinel["last"] = now
        self.air = {
            "ts_ms": d["timestamp_ms"],
            "ch": d["channel"],
            "frames_per_s": (d["beacon_count"] + d["data_count"]) / dt,
            "deauth_per_s": d["deauth_count"] / dt
        }

    def derive_network_state(self) -> str:
        now = time.time()
        if self.max_seq is None and (now - self.start_time < 3.0):
            return "BOOT"

        last_t = self.last_pkt.get("t", 0)
        if last_t == 0 or (now - last_t > 4.5):
            return "DEGRADED_OFFLINE" if len(self.seen) > 0 else "WIFI_CONNECTING"

        mode = self.last_pkt.get("mode", "wifi")
        if mode == "radio":
            if self.pending_cmd and self.pending_cmd.get("cmd") == "wifi" and self.pending_cmd.get("status") == "sent":
                return "RECOVERY_PENDING"
            return "RADIO_ACTIVE"
        else:
            if self.last_recovery_time and (now - self.last_recovery_time < 4.0):
                return "RECOVERY_PROBATION"
            loss = self.last_pkt.get("loss", 0)
            rtt = self.last_pkt.get("rtt", 0)
            rssi = self.last_pkt.get("rssi", -50)
            if loss > 15 or rtt > 150 or rssi < -82:
                return "WIFI_DEGRADED"
            return "WIFI_ACTIVE"

    # ---------- dashboard snapshot ----------
    def snapshot(self) -> Dict[str, Any]:
        now = time.time()
        readings = [[s, round(r["t"], 2), r["sensor"], "+".join(sorted(r["paths"]))]
                    for s, r in self.seen.items() if now - r["t"] < 60]
        held = self.agent.held
        gw_online = (now - self.gateway["last"] < 5.0) if self.gateway["last"] > 0 else False

        # Timeout check on pending command
        if self.pending_cmd and self.pending_cmd.get("status") == "sent":
            if now - self.pending_cmd.get("sent_at", 0) > 2.5:
                self.pending_cmd["status"] = "timeout"
                self.pending_cmd["detail"] = "Command timed out without device acknowledgement"
                self.log_event("COMMAND_TIMEOUT", f"Command '{self.pending_cmd.get('cmd')}' timed out", "HUB")

        active_source = "NONE"
        if now - self.last_pkt.get("t", 0) < 3.0:
            active_source = "NODE_A_WIFI" if self.last_pkt.get("path") == "wifi" else "NODE_B_RADIO"

        if now - self.sentinel.get("last", 0) > 4.0:
            if self.air.get("deauth_per_s", 0) > 0 and self.agent.alert == "deauth":
                self.air["deauth_per_s"] = 0.0
                self.agent.alert = None

        return {
            "now": now,
            "state": self.derive_network_state(),
            "source_type": "HARDWARE",
            "active_source": active_source,
            "node": {
                "online": now - self.last_pkt.get("t", 0) < 4.0,
                "mode": self.last_pkt.get("mode"),
                "why": self.last_pkt.get("why"),
                "path": self.last_pkt.get("path"),
                "reason": REASON_NAMES.get(self.last_pkt.get("reason", 0), str(self.last_pkt.get("reason"))),
                "seq": self.last_pkt.get("seq"),
                "sensor": self.last_pkt.get("sensor"),
                "rssi": self.last_pkt.get("rssi"),
                "rtt": self.last_pkt.get("rtt"),
                "loss": self.last_pkt.get("loss"),
                "ch": self.last_pkt.get("ch")
            },
            "wifi_age": round(now - self.last_wifi, 1) if self.last_wifi else None,
            "radio_age": round(now - self.last_radio, 1) if self.last_radio else None,
            "gateway": {
                **self.gateway,
                "online": gw_online
            },
            "sentinel": {
                "port": self.sentinel.get("port"),
                "online": (now - self.sentinel.get("last", 0) < 3.5) if self.sentinel.get("last", 0) > 0 else False,
                "fault": self.sentinel.get("fault", 0),
                "anomaly": self.sentinel.get("anomaly", "NOMINAL"),
                "rssi": self.sentinel.get("rssi", -60),
                "ch": self.sentinel.get("ch", 6),
                "ip": self.sentinel.get("ip"),
            },
            "air": self.air,
            "readings": readings,
            "lost": self.lost(),
            "total": len(self.seen),
            "wifi_count": self.wifi_count,
            "radio_count": self.radio_count,
            "cmd_state": self.pending_cmd,
            "events": list(self.events),
            "features": self.features,
            "probs": self.probs or {c: 0 for c in CLASSES},
            "held": held,
            "model": self.diag.info,
            "agent": list(self.agent.log),
            "alert": self.agent.alert,
            "incident": self.agent.incident,
            "reports": list(self.reports),
            "recording": {"label": self.label, "rows": self.rows},
        }


hub = Hub()


class NodeUDP(asyncio.DatagramProtocol):
    def connection_made(self, transport):
        hub.transport = transport

    def datagram_received(self, data, addr):
        try:
            pkt = json.loads(data)
        except (ValueError, TypeError):
            return
        if not isinstance(pkt, dict):
            return

        n = str(pkt.get("n", ""))
        # 1. Direct Node 1 / Node A Wi-Fi Telemetry & Commands
        if n in ("A", "1"):
            if "cmd_ack" in pkt:
                hub.on_cmd_ack(pkt)
                return
            if "seq" in pkt:
                # Immediate ACK so Node measures accurate RTT
                ack_msg = json.dumps({"ack": pkt["seq"]}).encode()
                try:
                    hub.transport.sendto(ack_msg, addr)
                except Exception:
                    pass
                hub.node_addr = addr
                hub.ingest(pkt, "wifi")

        # 2. Node 2 / Node B Gateway Forwarded Telemetry & Heartbeats
        elif n in ("B", "2"):
            if "hb" in pkt:
                hub.on_gateway_heartbeat(pkt, source="udp")
            elif "seq" in pkt:
                hub.ingest(pkt, "radio")

        # 3. Node 3 / Node C Sentinel Channel & Fault Telemetry
        elif n in ("C", "3"):
            hub.on_sentinel_udp(pkt)


def serial_scanner(loop: asyncio.AbstractEventLoop):
    """Finds the gateway (115200) and Sentinel (921600) by what they print."""
    try:
        import serial
    except ImportError:
        print("[hub] pyserial missing: serial radio path disabled")
        return
    claimed: Dict[str, str] = {}

    def open_port(port: str, baud: int):
        s = serial.Serial()
        s.port, s.baudrate, s.timeout = port, baud, 0.3
        s.dtr = s.rts = False  # don't reset ESP32/ESP8266 boards on open
        s.open()
        return s

    def probe(port: str) -> Optional[tuple]:
        for baud, role, marker in ((115200, "gateway", '"n":"B"'), (921600, "sentinel", "deauth_count")):
            try:
                s = open_port(port, baud)
            except Exception:
                return None
            end = time.time() + 3.5
            while time.time() < end:
                line = s.readline().decode(errors="ignore")
                if marker in line:
                    return role, s
            s.close()
        return "other", None

    def reader(port: str, role: str, s):
        handler = hub.on_gateway_line if role == "gateway" else hub.on_sentinel_line
        getattr(hub, role)["port"] = port
        if role == "sentinel":
            hub.sentinel["serial"] = s
        print(f"[hub] {role} on {port}")
        try:
            while True:
                line = s.readline().decode(errors="ignore").strip()
                if line.startswith("{"):
                    try:
                        loop.call_soon_threadsafe(handler, json.loads(line))
                    except ValueError:
                        pass
        except Exception as e:
            print(f"[hub] {role} on {port} gone: {e}")
        finally:
            getattr(hub, role)["port"] = None
            if role == "sentinel":
                hub.sentinel["serial"] = None
            claimed.pop(port, None)

    forced = {os.environ.get("GATEWAY_PORT"): "gateway", os.environ.get("SENTINEL_PORT"): "sentinel"}
    while True:
        ports = set(glob.glob("/dev/ttyUSB*") + glob.glob("/dev/ttyACM*"))
        for gone in set(claimed) - ports:
            claimed.pop(gone)
        for port in sorted(ports - set(claimed)):
            if port in forced:
                role = forced[port]
                try:
                    s = open_port(port, 115200 if role == "gateway" else 921600)
                except Exception:
                    continue
            else:
                found = probe(port)
                if not found:
                    continue
                role, s = found
            claimed[port] = role
            if s:
                threading.Thread(target=reader, args=(port, role, s), daemon=True).start()
            else:
                print(f"[hub] {port}: not a gateway or sentinel, ignoring")
        time.sleep(3)


clients: set = set()


async def broadcaster():
    while True:
        if clients:
            msg = json.dumps(hub.snapshot(), default=list)
            for ws in list(clients):
                try:
                    await ws.send_text(msg)
                except Exception:
                    clients.discard(ws)
        await asyncio.sleep(0.2)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    loop = asyncio.get_running_loop()
    await loop.create_datagram_endpoint(NodeUDP, local_addr=("0.0.0.0", UDP_PORT), allow_broadcast=True)
    threading.Thread(target=serial_scanner, args=(loop,), daemon=True).start()
    task = asyncio.create_task(broadcaster())
    print(f"[hub] listening for Node A / Node B on UDP {UDP_PORT}; dashboard on http://localhost:{os.environ.get('PORT', 8500)}")
    yield
    task.cancel()


app = FastAPI(title="Self-Healing IoT Network Hub", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
if os.path.isdir(DIST_DIR):
    app.mount("/app", StaticFiles(directory=DIST_DIR, html=True), name="app")


@app.get("/")
async def index():
    if os.path.isdir(DIST_DIR):
        return RedirectResponse("/app/")
    return FileResponse(os.path.join(WEB_DIR, "index.html"))


@app.get("/classic")
async def classic():
    return FileResponse(os.path.join(WEB_DIR, "index.html"))


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    # Immediately send a snapshot upon connecting
    await ws.send_text(json.dumps(hub.snapshot(), default=list))
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        clients.discard(ws)


@app.post("/api/record")
async def record(body: Dict[str, Any]):
    label = body.get("label")
    if label is not None and label not in CLASSES:
        raise HTTPException(400, f"label must be one of {CLASSES} or null")
    hub.label = label
    hub.session = int(time.time()) if label else 0
    return {"label": label, "rows": hub.rows}


@app.post("/api/model/reload")
async def reload_model():
    hub.diag = Diagnoser()
    return hub.diag.info


@app.post("/api/cmd/rate")
async def cmd_rate(body: Dict[str, Any]):
    ms = int(body.get("ms", 1000))
    ms = max(250, min(5000, ms))
    res = hub.send_cmd({"cmd": "rate", "ms": ms})
    return res


@app.post("/api/cmd/trigger_alert")
async def trigger_cluster_alert():
    hub.agent.alert = "deauth"
    hub.air["deauth_per_s"] = 142.0
    hub.air["frames_per_s"] = 460.0
    hub.sentinel["fault"] = 1
    hub.sentinel["last"] = time.time()
    hub.sentinel["online"] = True
    hub.gateway["alert"] = "PREDICTIVE_FAILOVER"
    hub.log_event("CLUSTER_THREAT_SIMULATION", "Channel anomaly & deauth attack triggered via dashboard", "DASHBOARD")
    return {"status": "ok", "alert": "deauth"}


@app.post("/api/cmd/clear_alert")
async def clear_cluster_alert():
    hub.agent.alert = None
    hub.air["deauth_per_s"] = 0.0
    hub.air["frames_per_s"] = 35.0
    hub.sentinel["fault"] = 0
    hub.gateway["alert"] = "NOMINAL"
    hub.log_event("CLUSTER_ALERTS_CLEARED", "All cluster alerts and threat simulations reset to nominal", "DASHBOARD")
    return {"status": "ok", "alert": None}


@app.post("/api/cmd/test_buzzer")
async def test_supervisor_buzzer():
    hub.gateway["alert"] = "PREDICTIVE_FAILOVER"
    hub.gateway["last"] = time.time()
    hub.gateway["online"] = True
    if hub.transport:
        try:
            hub.transport.sendto(json.dumps({"cmd": "buzzer", "val": 1}).encode(), ("255.255.255.255", 4210))
        except Exception:
            pass
    hub.log_event("SUPERVISOR_BUZZER_TEST", "Test buzzer pulse dispatched to Node 2 Supervisor", "DASHBOARD")
    return {"status": "ok"}


@app.post("/api/cmd/zero_sensor")
async def zero_sensor():
    if hub.transport and hub.node_addr:
        try:
            hub.transport.sendto(json.dumps({"cmd": "zero"}).encode(), hub.node_addr)
        except Exception:
            pass
    hub.log_event("OPTICAL_BASELINE_REZERO", "Baseline optical sensor calibration synchronized", "DASHBOARD")
    return {"status": "ok"}


@app.post("/api/cmd/{name}")
async def manual_cmd(name: str):
    if name not in ("radio", "wifi"):
        raise HTTPException(400, "Command must be 'radio' or 'wifi'")
    res = hub.send_cmd({"cmd": name})
    return res



@app.post("/api/dev/radio")
async def dev_radio(line: Dict[str, Any]):
    """Lets simulator or fake_node.py inject gateway telemetry without physical hardware."""
    hub.on_gateway_line(line)
    return {"ok": True}


@app.get("/api/incidents")
async def incidents():
    out = []
    for f in sorted(glob.glob(os.path.join(INCIDENTS_DIR, "*.json")), reverse=True):
        with open(f) as fp:
            out.append(json.load(fp))
    return out


@app.get("/api/status")
async def api_status():
    return hub.snapshot()


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8500)))
