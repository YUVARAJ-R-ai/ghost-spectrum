"""
Ghost Spectrum · Hybrid Agentic Orchestrator
Dual-Engine Decision Architecture:
1. Cloud Reasoning: AWS Bedrock (Amazon Nova Lite / Micro via Bedrock Converse API)
2. On-Device Autonomic Link Intelligence: Local "JEV" (Sub-5ms deterministic tool caller & decision router)
"""

import os
import time
import json
import re
from collections import deque
from typing import Dict, Any, Optional

try:
    import boto3
    from botocore.config import Config
    from botocore.exceptions import BotoCoreError, ClientError
    BOTO3_AVAILABLE = True
except ImportError:
    BOTO3_AVAILABLE = False


BEDROCK_TOOLS = [
    {
        "toolSpec": {
            "name": "trigger_buzzer",
            "description": "Trigger the physical alert buzzer alarm on the Node 2 Supervisor for testing or intrusion notification.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "count": {"type": "integer", "description": "Number of beeps, default 3"},
                        "duration_ms": {"type": "integer", "description": "Duration of each beep pulse in ms, default 120"}
                    }
                }
            }
        }
    },
    {
        "toolSpec": {
            "name": "simulate_threat",
            "description": "Simulate a synthetic RF deauthentication or jamming cyber attack on Node 3 Sentinel.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "channel": {"type": "integer", "description": "Target 802.11 channel (1-13), default 11"},
                        "intensity": {"type": "string", "enum": ["low", "high", "critical"], "description": "Attack severity level"}
                    }
                }
            }
        }
    },
    {
        "toolSpec": {
            "name": "rearm_cluster",
            "description": "Clear all active cyber alarms, mute sirens, and return the cluster to nominal monitoring state.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "reset_counters": {"type": "boolean", "description": "Whether to reset lost packet counters"}
                    }
                }
            }
        }
    },
    {
        "toolSpec": {
            "name": "zero_optical_sensor",
            "description": "Trigger ambient baseline recalibration on Node 1 optical proximity sensor.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {}
                }
            }
        }
    },
    {
        "toolSpec": {
            "name": "set_telemetry_rate",
            "description": "Configure the cluster telemetry broadcast interval.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "rate_ms": {"type": "integer", "description": "Interval in milliseconds, e.g. 250 (fast), 500 (normal), 1000 (eco)"}
                    },
                    "required": ["rate_ms"]
                }
            }
        }
    },
    {
        "toolSpec": {
            "name": "switch_sentinel_mode",
            "description": "Change Node 3 Sentinel operational mode between SPECTRUM_SWEEPER, TRAFFIC_MONITOR, and SYNTHETIC_JAMMER.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "mode": {"type": "string", "enum": ["SPECTRUM_SWEEPER", "TRAFFIC_MONITOR", "SYNTHETIC_JAMMER"]}
                    },
                    "required": ["mode"]
                }
            }
        }
    },
    {
        "toolSpec": {
            "name": "query_cluster_telemetry",
            "description": "Retrieve current health, latency, RSSI, and node status from the cluster.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {}
                }
            }
        }
    },
    {
        "toolSpec": {
            "name": "control_led",
            "description": "Turn Node 1 optical bargraph LEDs on or off, or toggle manual override.",
            "inputSchema": {
                "json": {
                    "type": "object",
                    "properties": {
                        "state": {"type": "string", "enum": ["on", "off", "toggle"], "description": "Desired LED state: on or off"}
                    },
                    "required": ["state"]
                }
            }
        }
    }
]


class JevLocalAgent:
    """
    Local 'JEV' (Joint Edge Validator & Autonomic Link Decision Agent).
    Designed for zero-latency (<5ms), fully offline edge tool calling and link decisions.
    """

    def __init__(self, hub_instance):
        self.hub = hub_instance

    def process(self, text: str) -> Dict[str, Any]:
        t0 = time.perf_counter()
        raw = text.strip().lower()

        # Tool 1: Jamming / Attack simulation
        if any(w in raw for w in ("jam", "deauth", "attack", "exploit", "threat")):
            self.hub.agent.alert = "deauth"
            self.hub.air["deauth_per_s"] = 158.0
            self.hub.air["frames_per_s"] = 480.0
            self.hub.sentinel["fault"] = 1
            self.hub.sim_hold_until = time.time() + 6.0
            self.hub.sentinel["last"] = time.time()
            self.hub.sentinel["online"] = True
            self.hub.gateway["alert"] = "PREDICTIVE_FAILOVER"
            self.hub.log_event("THREAT_ALERT", "Synthetic jamming anomaly triggered on channel 11", "JEV_LOCAL")
            self.hub.broadcast_cluster_command({"cmd": "threat", "val": 1, "alert": "threat"})
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            return {
                "reply": "Simulating a jamming attack now. Board 3 raises the alarm and the others react; it clears by itself in a few seconds.",
                "engine": "jev",
                "model": "jev-autonomic-v2",
                "action": "JAMMING",
                "status": "ok",
                "latency_ms": elapsed
            }

        # Tool 2: Clear / Rearm
        if any(w in raw for w in ("clear", "reset", "rearm", "re-arm", "nominal", "stand down", "stop")):
            self.hub.agent.alert = None
            self.hub.air["deauth_per_s"] = 0.0
            self.hub.air["frames_per_s"] = 35.0
            self.hub.sentinel["fault"] = 0
            self.hub.gateway["alert"] = "NOMINAL"
            self.hub.log_event("ALERT_CLEARED", "Cluster security state restored to NOMINAL", "JEV_LOCAL")
            self.hub.broadcast_cluster_command({"cmd": "clear"})
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            return {
                "reply": "All alarms cleared. Everything is back to normal.",
                "engine": "jev",
                "model": "jev-autonomic-v2",
                "action": "CLEAR",
                "status": "ok",
                "latency_ms": elapsed
            }

        # Tool 3: Buzzer test
        if any(w in raw for w in ("alarm", "buzzer", "beep", "chirp", "siren")):
            self.hub.gateway["alert"] = "PREDICTIVE_FAILOVER"
            self.hub.gateway["last"] = time.time()
            self.hub.gateway["online"] = True
            self.hub.broadcast_cluster_command({"cmd": "buzzer", "val": 1})
            self.hub.log_event("BUZZER_TEST", "Dispatched test audio warble to Node 2", "JEV_LOCAL")
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            return {
                "reply": "Testing the alarm: board 2 should beep now.",
                "engine": "jev",
                "model": "jev-autonomic-v2",
                "action": "BUZZER",
                "status": "ok",
                "latency_ms": elapsed
            }

        # Tool 4: Calibrate optical sensor
        if any(w in raw for w in ("calibrate", "zero", "tare", "optical", "baseline")):
            self.hub.broadcast_cluster_command({"cmd": "zero"})
            self.hub.log_event("CALIBRATE_SENSOR", "Dispatched zero command to Node 1", "JEV_LOCAL")
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            return {
                "reply": "Recalibrating board 1's sensor. Keep your hand away for a second.",
                "engine": "jev",
                "model": "jev-autonomic-v2",
                "action": "CALIBRATE",
                "status": "ok",
                "latency_ms": elapsed
            }

        # Tool 5: Telemetry rate
        match = re.search(r"(\d+)\s*(?:ms|millisecond)?", raw)
        if any(w in raw for w in ("fast", "turbo", "rate", "speed", "interval")) or match:
            rate = int(match.group(1)) if match else 250
            if rate < 50:
                rate = 50
            if rate > 5000:
                rate = 5000
            self.hub.broadcast_cluster_command({"cmd": "rate", "ms": rate})
            self.hub.send_cmd({"cmd": "rate", "ms": rate})
            self.hub.log_event("CONFIG_UPDATE", f"Telemetry rate modified to {rate}ms", "JEV_LOCAL")
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            return {
                "reply": f"Board 1 now reports every {rate} ms.",
                "engine": "jev",
                "model": "jev-autonomic-v2",
                "action": "RATE",
                "status": "ok",
                "latency_ms": elapsed
            }

        # Tool 6: LED control
        if any(w in raw for w in ("led", "light", "lights", "lamp", "flash")):
            val = 0 if any(k in raw for k in ("off", "low", "stop", "0", "kill", "down")) else 1
            self.hub.broadcast_cluster_command({"cmd": "led", "val": val})
            self.hub.log_event("LED_CONTROL", f"Set LED to {val}", "JEV_LOCAL")
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            return {
                "reply": f"Turning the lights {'on' if val else 'off'}.",
                "engine": "jev",
                "model": "jev-autonomic-v2",
                "action": "LED",
                "status": "ok",
                "latency_ms": elapsed
            }

        # Tool 7: Radio / Wi-Fi failover
        if "radio" in raw:
            res = self.hub.send_cmd({"cmd": "radio"})
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            return {
                "reply": "Switching to the backup radio link.",
                "engine": "jev",
                "model": "jev-autonomic-v2",
                "action": "RADIO",
                "status": res.get("status", "ok"),
                "latency_ms": elapsed
            }
        if "wifi" in raw:
            res = self.hub.send_cmd({"cmd": "wifi"})
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            return {
                "reply": "Switching back to Wi-Fi.",
                "engine": "jev",
                "model": "jev-autonomic-v2",
                "action": "WIFI",
                "status": res.get("status", "ok"),
                "latency_ms": elapsed
            }

        # Tool 8: Cluster status inquiry
        state = self.hub.derive_network_state()
        now = time.time()
        n1_ok = (now - self.hub.last_pkt.get("t", 0) < 4.0) if self.hub.last_pkt else False
        n2_ok = (now - self.hub.gateway.get("last", 0) < 5.0) if self.hub.gateway.get("last", 0) > 0 else False
        n3_ok = (now - self.hub.sentinel.get("last", 0) < 4.0) if self.hub.sentinel.get("last", 0) > 0 else False
        active_count = sum([n1_ok, n2_ok, n3_ok])
        rssi = self.hub.last_pkt.get("rssi", -65) if self.hub.last_pkt else -65
        rtt = self.hub.last_pkt.get("rtt", 15.0) if self.hub.last_pkt else 15.0
        elapsed = round((time.perf_counter() - t0) * 1000, 2)

        return {
            "reply": f"{active_count} of 3 boards are online and the network is {state.replace('_', ' ').lower()}. Replies take about {rtt} ms.",
            "engine": "jev",
            "model": "jev-autonomic-v2",
            "action": "STATUS",
            "status": "ok",
            "latency_ms": elapsed
        }


class BedrockAgent:
    """
    AWS Bedrock Conversational Reasoning Agent.
    Utilizes Amazon Nova Lite / Nova Micro with native tool-calling capabilities.
    """

    def __init__(self, hub_instance, region: str = "ap-south-1"):
        self.hub = hub_instance
        self.region = os.environ.get("AWS_REGION", region)
        self.client = None
        self.model_id = "apac.amazon.nova-lite-v1:0"
        self.fallback_model = "apac.amazon.nova-micro-v1:0"
        # Last few exchanges, so follow-up questions ("and now?") make sense
        self.history: deque = deque(maxlen=8)
        if not BOTO3_AVAILABLE:
            print("[BedrockAgent] boto3 missing, chat uses the local engine")
            return
        # Only switch on when AWS keys exist (env vars or ~/.aws/credentials); otherwise every
        # message would wait on a doomed network call before falling back
        if boto3.Session().get_credentials() is None:
            print("[BedrockAgent] no AWS keys found, chat uses the local engine")
            return
        try:
            # Fail fast when the demo network has no internet, so the local engine answers instead
            cfg = Config(connect_timeout=3, read_timeout=12, retries={"max_attempts": 1})
            self.client = boto3.client("bedrock-runtime", region_name=self.region, config=cfg)
            print(f"[BedrockAgent] ready ({self.model_id}, {self.region})")
        except Exception as e:
            print(f"[BedrockAgent] Initialization warning: {e}")

    def live_context(self) -> str:
        """What the assistant can see right now: each node, the alert state and the latest events."""
        h = self.hub
        now = time.time()
        node1_online = bool(h.last_pkt.get("t")) and now - h.last_pkt.get("t", 0) < 4.5
        n1 = h.last_pkt
        lines = [
            f"Network state: {h.derive_network_state()}. Active alert: {h.agent.alert or 'none'}.",
            f"Node 1 (IR sensor): {'online' if node1_online else 'offline'}, sensor {n1.get('sensor', '?')}, "
            f"round trip {n1.get('rtt', '?')} ms, packet loss {n1.get('loss', '?')}%, signal {n1.get('rssi', '?')} dBm.",
            f"Node 2 (supervisor, OLED and buzzer): {'online' if h.gateway.get('online') else 'offline'}, "
            f"alert '{h.gateway.get('alert', 'NOMINAL')}', health {h.gateway.get('health', '?')}%.",
            f"Node 3 (RF sentinel, buzzer and LED): {'online' if h.sentinel.get('online') else 'offline'}, "
            f"jamming fault {'ACTIVE' if h.sentinel.get('fault') else 'none'}, channel {h.sentinel.get('ch', '?')}.",
            "Recent events, newest first: " + "; ".join(
                f"{time.strftime('%H:%M:%S', time.localtime(e['t']))} {e['kind']} ({e['detail']})"
                for e in list(h.events)[:6]),
        ]
        return "\n".join(lines)

    def _converse(self, messages, sys_prompt):
        last = None
        for model in (self.model_id, self.fallback_model):
            try:
                return self.client.converse(modelId=model, messages=messages, system=[{"text": sys_prompt}],
                                            toolConfig={"tools": BEDROCK_TOOLS}, inferenceConfig={"maxTokens": 300})
            except Exception as e:
                last = e
        raise last

    def execute_tool(self, tool_name: str, args: Dict[str, Any]) -> str:
        """Executes the tool requested by Bedrock and returns result string."""
        if tool_name == "trigger_buzzer":
            self.hub.gateway["alert"] = "PREDICTIVE_FAILOVER"
            self.hub.gateway["last"] = time.time()
            self.hub.gateway["online"] = True
            self.hub.broadcast_cluster_command({"cmd": "buzzer", "val": 1})
            self.hub.log_event("BUZZER_TEST", "Bedrock dispatched audio alarm to Node 2", "BEDROCK_AGENT")
            return "Buzzer alarm successfully pulsed on Node 2 Supervisor."

        elif tool_name == "simulate_threat":
            ch = args.get("channel", 11)
            self.hub.agent.alert = "deauth"
            self.hub.air["deauth_per_s"] = 145.0
            self.hub.air["frames_per_s"] = 460.0
            self.hub.sentinel["fault"] = 1
            self.hub.sim_hold_until = time.time() + 6.0
            self.hub.sentinel["ch"] = ch
            self.hub.sentinel["last"] = time.time()
            self.hub.sentinel["online"] = True
            self.hub.gateway["alert"] = "PREDICTIVE_FAILOVER"
            self.hub.log_event("THREAT_ALERT", f"Bedrock simulated cyber attack on channel {ch}", "BEDROCK_AGENT")
            self.hub.broadcast_cluster_command({"cmd": "threat", "val": 1, "alert": "threat"})
            return f"Synthetic cyber attack simulation active on channel {ch}. Node 3 and Node 2 alerted."

        elif tool_name == "rearm_cluster":
            self.hub.agent.alert = None
            self.hub.air["deauth_per_s"] = 0.0
            self.hub.air["frames_per_s"] = 35.0
            self.hub.sentinel["fault"] = 0
            self.hub.gateway["alert"] = "NOMINAL"
            self.hub.log_event("ALERT_CLEARED", "Bedrock rearmed cluster security state", "BEDROCK_AGENT")
            self.hub.broadcast_cluster_command({"cmd": "clear"})
            return "Cluster security state nominal. All alerts dismissed."

        elif tool_name == "zero_optical_sensor":
            self.hub.broadcast_cluster_command({"cmd": "zero"})
            self.hub.log_event("CALIBRATE_SENSOR", "Bedrock zeroed Node 1 sensor", "BEDROCK_AGENT")
            return "Node 1 ambient optical baseline recalibration command dispatched."

        elif tool_name == "set_telemetry_rate":
            rate = args.get("rate_ms", 350)
            self.hub.broadcast_cluster_command({"cmd": "rate", "ms": rate})
            self.hub.send_cmd({"cmd": "rate", "ms": rate})
            self.hub.log_event("CONFIG_UPDATE", f"Bedrock set rate to {rate}ms", "BEDROCK_AGENT")
            return f"Telemetry broadcast rate updated to {rate}ms."

        elif tool_name == "switch_sentinel_mode":
            mode = args.get("mode", "TRAFFIC_MONITOR")
            self.hub.log_event("SENTINEL_MODE", f"Switched Sentinel mode to {mode}", "BEDROCK_AGENT")
            return f"Node 3 Sentinel operational mode switched to {mode}."

        elif tool_name == "query_cluster_telemetry":
            state = self.hub.derive_network_state()
            return f"Cluster state: {state}. Lost frames: {self.hub.lost()}. Total seen: {len(self.hub.seen)}."

        elif tool_name == "control_led":
            state = str(args.get("state", "on")).lower()
            val = 0 if state in ("off", "low", "0") else 1
            self.hub.broadcast_cluster_command({"cmd": "led", "val": val})
            self.hub.log_event("LED_CONTROL", f"Bedrock set LED to {val}", "BEDROCK_AGENT")
            return f"Node 1 bargraph LEDs commanded {'ON' if val else 'OFF'} across cluster."

        return f"Unknown tool: {tool_name}"

    def process(self, text: str) -> Dict[str, Any]:
        t0 = time.perf_counter()
        if not self.client:
            return {"error": "Bedrock client not initialized", "status": "fallback"}

        sys_prompt = (
            "You are the operations assistant for Kinesis, a self-healing IoT network of three boards that "
            "sense, decide and warn each other directly; a laptop dashboard only watches and logs. "
            "Node 1 senses proximity with an IR sensor. Node 2 supervises, shows status on an OLED and sounds "
            "a buzzer; its button lets a person report an incident. Node 3 watches the radio channel for "
            "jamming and heals by itself when it stops. "
            "Answer in plain, friendly language for a non-technical audience, in at most two short sentences. "
            "Use the live status below to answer questions about what is happening. When the operator asks to "
            "test alarms, simulate an attack, clear or re-arm, calibrate the sensor, change the reporting speed "
            "or switch lights, call the matching tool. Never invent readings that are not in the status.\n\n"
            "LIVE STATUS\n" + self.live_context()
        )
        messages = list(self.history) + [{"role": "user", "content": [{"text": text}]}]

        try:
            resp = self._converse(messages, sys_prompt)
            out_msg = resp.get("output", {}).get("message", {})
            contents = out_msg.get("content", [])
            action = "CONVERSE"
            tool_results = []
            for item in contents:
                if "toolUse" in item:
                    tool_use = item["toolUse"]
                    action = tool_use.get("name", "tool").upper()
                    result = self.execute_tool(tool_use.get("name"), tool_use.get("input", {}))
                    tool_results.append({"toolResult": {"toolUseId": tool_use["toolUseId"], "content": [{"text": result}]}})
            if tool_results:
                # Hand the results back so the model says what happened in its own words
                messages = messages + [out_msg, {"role": "user", "content": tool_results}]
                out_msg = self._converse(messages, sys_prompt).get("output", {}).get("message", {})
                contents = out_msg.get("content", [])
        except Exception as e:
            return {"error": f"Bedrock error: {e}", "status": "fallback"}

        texts = [re.sub(r"<thinking>.*?</thinking>", "", c["text"], flags=re.DOTALL).strip() for c in contents if "text" in c]
        final_reply = next((t for t in texts if t), "Done.")
        self.history.append({"role": "user", "content": [{"text": text}]})
        self.history.append({"role": "assistant", "content": [{"text": final_reply}]})

        return {
            "reply": final_reply,
            "engine": "bedrock",
            "model": "amazon.nova-lite",
            "action": action,
            "status": "ok",
            "latency_ms": round((time.perf_counter() - t0) * 1000, 2),
        }
