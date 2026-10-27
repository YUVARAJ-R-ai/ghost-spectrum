"""
Laptop hub: receives Node A over Wi-Fi (UDP) and over 433 MHz radio (via the Uno
gateway on USB), merges both paths into one reading stream, runs the link
doctor + agent, records labelled training data, and serves the dashboard.
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
from typing import Any, Dict, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from brain import CLASSES, FEATURES, REASON_NAMES, WINDOW_S, Agent, Diagnoser, extract_features
from forensic import INCIDENTS_DIR, write_incident_report

UDP_PORT = 4210
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
        self.reset_run()
        self.last_wifi = self.last_radio = 0.0
        self.gateway: Dict[str, Any] = {"port": None, "last": 0.0}
        self.sentinel: Dict[str, Any] = {"port": None, "last": 0.0, "serial": None}
        self.air: Dict[str, Any] = {}
        self.label: Optional[str] = None
        self.session = 0
        self.rows = sum(1 for _ in open(DATA_CSV)) - 1 if os.path.exists(DATA_CSV) else 0
        self.reports = deque(maxlen=10)

    def reset_run(self):
        self.window: deque = deque()
        self.seen: Dict[int, Dict[str, Any]] = {}
        self.pending: Dict[int, float] = {}      # missing seq -> when we noticed the gap
        self.max_seq: Optional[int] = None
        self.last_pkt: Dict[str, Any] = {}
        self.features: Dict[str, float] = {}
        self.probs: Dict[str, float] = {}

    # ---------- ingest ----------
    def ingest(self, pkt: Dict[str, Any], path: str):
        now = time.time()
        seq = int(pkt["seq"])
        if path == "wifi":
            self.last_wifi = now
        else:
            self.last_radio = now
            if pkt.get("mode") != "radio" and seq in self.seen:
                return  # standby beacon for a reading Wi-Fi already delivered
        if self.max_seq is not None and seq < self.max_seq - 50:
            self.reset_run()  # node rebooted
        if seq in self.seen:
            self.seen[seq]["paths"].add(path)
            return
        self.pending.pop(seq, None)
        if self.max_seq is not None:
            for gap in range(self.max_seq + 1, seq):
                self.pending[gap] = now
        self.max_seq = seq if self.max_seq is None else max(self.max_seq, seq)
        self.seen[seq] = {"t": now, "sensor": pkt["sensor"], "paths": {path}}
        if len(self.seen) > 5000:
            del self.seen[min(self.seen)]

        p = {"t": now, "seq": seq, "rssi": pkt["rssi"], "rtt": pkt["rtt"], "loss": pkt["loss"],
             "reason": pkt["reason"], "connected": 1 if path == "wifi" else int(pkt.get("connected", 0))}
        self.last_pkt = {**pkt, "path": path, "t": now}
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
            self.sentinel["serial"].write(f"CH:{pkt['ch']}\n".encode())  # watch the hotspot's channel

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

    def send_cmd(self, cmd: Dict[str, Any]) -> bool:
        """Commands ride Wi-Fi; if Wi-Fi is down the node is already acting on its own reflex."""
        if not (self.transport and self.node_addr and time.time() - self.last_wifi < 2):
            return False
        self.transport.sendto(json.dumps(cmd).encode(), self.node_addr)
        return True

    def incident_closed(self, inc: Dict[str, Any]):
        radio = sum(1 for r in self.seen.values() if r["t"] >= inc["start"] and r["paths"] == {"radio"})
        self.reports.appendleft(write_incident_report(inc, radio, self.lost(inc["start"])))

    # ---------- serial lines ----------
    def on_gateway_line(self, d: Dict[str, Any]):
        self.gateway["last"] = time.time()
        if "hb" in d:
            self.gateway.update(ok=d["ok"], bad=d["bad"], relay=d["relay"])
        elif "seq" in d:
            self.ingest(d, "radio")

    def on_sentinel_line(self, d: Dict[str, Any]):
        now = time.time()
        if "deauth_count" not in d:
            return
        dt = max((d["timestamp_ms"] - self.air.get("ts_ms", d["timestamp_ms"] - 200)) / 1000, 0.05)
        self.sentinel["last"] = now
        self.air = {"ts_ms": d["timestamp_ms"], "ch": d["channel"],
                    "frames_per_s": (d["beacon_count"] + d["data_count"]) / dt,
                    "deauth_per_s": d["deauth_count"] / dt}

    # ---------- dashboard snapshot ----------
    def snapshot(self) -> Dict[str, Any]:
        now = time.time()
        readings = [[s, round(r["t"], 2), r["sensor"], "+".join(sorted(r["paths"]))]
                    for s, r in self.seen.items() if now - r["t"] < 60]
        held = self.agent.held
        return {
            "now": now,
            "node": {"online": now - self.last_pkt.get("t", 0) < 3, "mode": self.last_pkt.get("mode"),
                     "why": self.last_pkt.get("why"), "path": self.last_pkt.get("path"),
                     "reason": REASON_NAMES.get(self.last_pkt.get("reason", 0), str(self.last_pkt.get("reason")))},
            "wifi_age": now - self.last_wifi if self.last_wifi else None,
            "radio_age": now - self.last_radio if self.last_radio else None,
            "gateway": {**self.gateway, "online": now - self.gateway["last"] < 5},
            "sentinel": {"port": self.sentinel["port"], "online": now - self.sentinel["last"] < 3},
            "air": self.air,
            "readings": readings,
            "lost": self.lost(),
            "total": len(self.seen),
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
        except ValueError:
            return
        if pkt.get("n") != "A" or "seq" not in pkt:
            return
        hub.transport.sendto(json.dumps({"ack": pkt["seq"]}).encode(), addr)  # ack first: RTT is measured on this
        hub.node_addr = addr
        hub.ingest(pkt, "wifi")


def serial_scanner(loop: asyncio.AbstractEventLoop):
    """Finds the Uno gateway (115200) and Sentinel (921600) by what they print."""
    try:
        import serial
    except ImportError:
        print("[hub] pyserial missing: radio path disabled")
        return
    claimed: Dict[str, str] = {}

    def open_port(port: str, baud: int):
        s = serial.Serial()
        s.port, s.baudrate, s.timeout = port, baud, 0.3
        s.dtr = s.rts = False  # don't reset ESP32 boards on open
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
                print(f"[hub] {port}: not a gateway or sentinel (Node A on USB?), ignoring")
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
    print(f"[hub] listening for Node A on UDP {UDP_PORT}; dashboard on http://localhost:{os.environ.get('PORT', 8500)}")
    yield
    task.cancel()


app = FastAPI(title="Link Doctor", lifespan=lifespan)
app.mount("/static", StaticFiles(directory=WEB_DIR), name="static")
if os.path.isdir(DIST_DIR):
    app.mount("/app", StaticFiles(directory=DIST_DIR, html=True), name="app")


@app.get("/")
async def index():
    # the 3D dashboard when it has been built, the original plain dashboard otherwise
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


@app.post("/api/cmd/{name}")
async def manual_cmd(name: str):
    if name not in ("radio", "wifi"):
        raise HTTPException(400, "radio or wifi")
    return {"sent": hub.send_cmd({"cmd": name})}


@app.post("/api/dev/radio")
async def dev_radio(line: Dict[str, Any]):
    """Lets tools/fake_node.py stand in for the Uno gateway when no hardware is plugged in."""
    hub.on_gateway_line(line)
    return {"ok": True}


@app.get("/api/incidents")
async def incidents():
    out = []
    for f in sorted(glob.glob(os.path.join(INCIDENTS_DIR, "*.json")), reverse=True):
        with open(f) as fp:
            out.append(json.load(fp))
    return out


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 8500)))
