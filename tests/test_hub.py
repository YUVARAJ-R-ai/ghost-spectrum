"""Self-check for the hub: run with `python3 tests/test_hub.py` inside nix-shell."""
import os
import sys
import time

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "server"))
import app  # noqa: E402
from brain import Agent, extract_features, rule_diagnose  # noqa: E402

app.write_incident_report = lambda inc, radio, lost: {"radio": radio, "lost": lost, **inc}


def pkt(seq, rssi=-50, rtt=20, loss=0, reason=0, mode="wifi", connected=1):
    return {"n": "A", "seq": seq, "sensor": 1000 + seq, "rssi": rssi, "rtt": rtt, "loss": loss,
            "reason": reason, "ch": 6, "mode": mode, "connected": connected}


def window(n, **kw):
    t0 = time.time()
    return [{**pkt(i, **kw), "t": t0 + i * 0.5} for i in range(n)]


def test_rules():
    assert max(rule_diagnose(extract_features(window(8))).items(), key=lambda kv: kv[1])[0] == "nominal"
    fading = [{**p, "rssi": -60 - 3 * i} for i, p in enumerate(window(8))]
    assert max(rule_diagnose(extract_features(fading)).items(), key=lambda kv: kv[1])[0] == "fading"
    jam = extract_features(window(8, rtt=300, loss=40))
    assert max(rule_diagnose(jam).items(), key=lambda kv: kv[1])[0] == "congestion"
    gone = extract_features(window(8, rssi=-100, reason=201, connected=0))
    assert max(rule_diagnose(gone).items(), key=lambda kv: kv[1])[0] == "ap_down"
    auth = extract_features(window(8, rssi=-100, reason=15, connected=0))
    assert max(rule_diagnose(auth).items(), key=lambda kv: kv[1])[0] == "auth_fail"


def test_merge_and_lost():
    hub = app.Hub()
    sent = []
    hub.send_cmd = lambda c: sent.append(c) or True
    for s in (1, 2, 3):
        hub.ingest(pkt(s), "wifi")
    hub.ingest(pkt(6, mode="radio"), "radio")      # 4 and 5 missing for now
    hub.ingest(pkt(6, mode="radio"), "wifi")       # duplicate: merged, not double counted
    assert hub.seen[6]["paths"] == {"radio", "wifi"}
    assert len(hub.seen) == 4 and set(hub.pending) == {4, 5}
    hub.ingest(pkt(4, mode="radio"), "radio")      # replayed late over radio
    assert set(hub.pending) == {5}
    assert hub.lost() == 0                         # still inside the grace period
    hub.pending[5] -= 10
    assert hub.lost() == 1
    hub.ingest(pkt(2), "radio")                    # standby beacon for an already-delivered reading
    assert hub.seen[2]["paths"] == {"wifi"}


def test_agent_fading_then_recovery():
    sent, closed = [], []
    agent = Agent(lambda c: sent.append(c) or True, closed.append)
    fading = {"rssi_now": -72, "rssi_slope": -4.0, "rtt_mean": 30, "loss_mean": 0}
    probs = {"nominal": 0.1, "fading": 0.8, "congestion": 0.05, "ap_down": 0.05, "auth_fail": 0.0}
    agent.step(probs, fading, "wifi", {})
    assert sent == []                              # one window is not enough evidence
    agent.step(probs, fading, "wifi", {})
    assert sent == [{"cmd": "radio"}] and agent.forced_radio
    assert "drop in ~4 s" in agent.log[0]["think"]
    ok = {"rssi_now": -50, "rssi_slope": 0.0, "rtt_mean": 20, "loss_mean": 0}
    healthy = {**{k: 0.0 for k in probs}, "nominal": 0.9}
    for _ in range(3):
        agent.step(healthy, ok, "radio", {})
    assert sent[-1] == {"cmd": "radio"}            # healthy, but not for 4 s yet
    agent.nominal_since -= 5
    agent.step(healthy, ok, "radio", {})
    assert sent[-1] == {"cmd": "wifi"} and not agent.forced_radio
    assert closed and closed[0]["diagnoses"] == ["fading"]
    assert closed[0]["actions"] == ["pre-emptive switch to 433 MHz"]


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok", name)
