#!/usr/bin/env python3
"""
Stand-in for Node A + the Uno gateway, for testing the hub and dashboard without
hardware. Type a scenario name and Enter to switch: nominal, fading, congestion,
ap_down, auth_fail.  Usage: python3 tools/fake_node.py [host]
"""
import json
import math
import random
import socket
import sys
import threading
import time
import urllib.request

HOST = sys.argv[1] if len(sys.argv) > 1 else "127.0.0.1"
scenario = {"name": "nominal", "since": time.time()}


def post_radio(line):
    req = urllib.request.Request(f"http://{HOST}:8500/api/dev/radio", json.dumps(line).encode(),
                                 {"Content-Type": "application/json"})
    urllib.request.urlopen(req, timeout=1).read()


def run():
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sock.settimeout(0.05)
    seq, mode, forced, interval = 0, "wifi", False, 0.5
    unacked = {}  # seq -> (sent_at, packet), mirrors Node A's store-and-forward
    while True:
        seq += 1
        s, age = scenario["name"], time.time() - scenario["since"]
        sensor = int(2000 + 900 * math.sin(time.time() / 3) + random.gauss(0, 40))
        rssi, rtt, loss, reason, connected = -48 + random.gauss(0, 2), 25 + random.gauss(0, 5), 0, 0, True
        if s == "fading":
            rssi = -50 - 4 * age + random.gauss(0, 1.5)
            connected = rssi > -88
            reason = 0 if connected else 200
        elif s == "congestion":
            rtt, loss = 220 + random.gauss(0, 60), random.choice([10, 20, 30, 40])
        elif s == "ap_down":
            connected, reason = False, (200 if age < 3 else 201)
        elif s == "auth_fail":
            connected, reason = False, 15
        if not connected:
            rssi, rtt, loss, mode = -100, 1000, 100, "radio"
        elif mode == "radio" and not forced and s == "nominal":
            mode = "wifi"
        pkt = {"n": "A", "seq": seq, "sensor": sensor, "rssi": int(rssi), "rtt": int(max(rtt, 1)),
               "loss": loss, "reason": reason, "ch": 6, "mode": mode, "why": "fake"}
        if mode != "radio":
            unacked[seq] = (time.time(), pkt)
        if connected and random.random() * 100 >= loss:
            sock.sendto(json.dumps(pkt).encode(), (HOST, 4210))
            end = time.time() + 0.1
            while time.time() < end:
                try:
                    msg = json.loads(sock.recv(256))
                except (socket.timeout, ValueError):
                    continue
                unacked.pop(msg.get("ack"), None)
                if msg.get("cmd") == "radio":
                    forced, mode = True, "radio"
                elif msg.get("cmd") == "wifi":
                    forced, mode = False, "wifi"
                elif msg.get("cmd") == "rate":
                    interval = msg["ms"] / 1000
        for old in [s for s, (t, _) in unacked.items() if time.time() - t > 0.8]:
            post_radio({**unacked.pop(old)[1], "n": "B", "connected": int(connected)})
        if mode == "radio" or seq % 10 == 0:
            post_radio({**pkt, "n": "B", "connected": int(connected)})
        time.sleep(interval)


threading.Thread(target=run, daemon=True).start()
print("fake node running. scenarios: nominal fading congestion ap_down auth_fail")
for line in sys.stdin:
    if line.strip():
        scenario.update(name=line.strip(), since=time.time())
        print("->", scenario["name"])
