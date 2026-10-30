"""
Ghost Spectrum · Hybrid Agentic Orchestrator
Dual-Engine Decision Architecture:
1. Cloud Reasoning: AWS Bedrock (Amazon Nova Lite / Micro via Bedrock Converse API)
2. On-Device Autonomic Link Intelligence: Local "JEV" (Sub-5ms deterministic tool caller & decision router)
"""

import time
import json
import re
from typing import Dict, Any, Optional

try:
    import boto3
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
            self.hub.sentinel["last"] = time.time()
            self.hub.sentinel["online"] = True
            self.hub.gateway["alert"] = "PREDICTIVE_FAILOVER"
            self.hub.log_event("THREAT_ALERT", "Synthetic jamming anomaly triggered on channel 11", "JEV_LOCAL")
            self.hub.broadcast_cluster_command({"cmd": "buzzer", "val": 1, "alert": "threat"})
            elapsed = round((time.perf_counter() - t0) * 1000, 2)
            return {
                "reply": f"⚡ [JEV Local] Autonomic Threat Engaged: Synthetic deauth attack triggered on channel 11. Gateway alert active. ({elapsed}ms)",
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
                "reply": f"⚡ [JEV Local] All alarms dismissed. Cluster returned to NOMINAL state. ({elapsed}ms)",
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
                "reply": f"⚡ [JEV Local] Dispatched audio warble command to Node 2 Supervisor buzzer. ({elapsed}ms)",
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
                "reply": f"⚡ [JEV Local] Recalibrating Node 1 ambient optical baseline. Ambient zero synchronized. ({elapsed}ms)",
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
                "reply": f"⚡ [JEV Local] Stream interval updated: streaming at {rate}ms per packet. ({elapsed}ms)",
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
                "reply": f"⚡ [JEV Local] Dispatched LED control ({'ON' if val else 'OFF'}) across cluster. ({elapsed}ms)",
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
                "reply": f"⚡ [JEV Local] Dispatched failover switch to 433 MHz RF link. ({elapsed}ms)",
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
                "reply": f"⚡ [JEV Local] Dispatched restoration to primary 802.11 Wi-Fi. ({elapsed}ms)",
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
            "reply": f"⚡ [JEV Local] Mesh State: {state}. Active nodes: {active_count}/3. Link RSSI: {rssi} dBm, Latency: {rtt}ms. ({elapsed}ms)",
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
        self.region = region
        self.client = None
        self.model_id = "apac.amazon.nova-lite-v1:0"
        self.fallback_model = "apac.amazon.nova-micro-v1:0"
        if BOTO3_AVAILABLE:
            try:
                self.client = boto3.client("bedrock-runtime", region_name=self.region)
            except Exception as e:
                print(f"[BedrockAgent] Initialization warning: {e}")

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
            self.hub.sentinel["ch"] = ch
            self.hub.sentinel["last"] = time.time()
            self.hub.sentinel["online"] = True
            self.hub.gateway["alert"] = "PREDICTIVE_FAILOVER"
            self.hub.log_event("THREAT_ALERT", f"Bedrock simulated cyber attack on channel {ch}", "BEDROCK_AGENT")
            self.hub.broadcast_cluster_command({"cmd": "buzzer", "val": 1, "alert": "threat"})
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

        # Construct concise system context
        state = self.hub.derive_network_state()
        sys_prompt = (
            "You are Ghost Spectrum Ops Intelligence, an elite cybersecurity tactical assistant "
            "supervising a 3-node IoT cyber mesh (Node 1: Sensor, Node 2: Supervisor OLED/Buzzer, "
            "Node 3: Sentinel RF Guard). Respond with precision and authority in 1-2 tactical sentences. "
            f"Current Network State: {state}. Lost packets: {self.hub.lost()}. "
            "Whenever the operator asks to test alarms, simulate attacks, rearm, calibrate, or change speed, "
            "YOU MUST CALL the appropriate tool."
        )

        messages = [
            {"role": "user", "content": [{"text": text}]}
        ]

        try:
            resp = self.client.converse(
                modelId=self.model_id,
                messages=messages,
                system=[{"text": sys_prompt}],
                toolConfig={"tools": BEDROCK_TOOLS}
            )
        except Exception as e:
            # Try fallback model
            try:
                resp = self.client.converse(
                    modelId=self.fallback_model,
                    messages=messages,
                    system=[{"text": sys_prompt}],
                    toolConfig={"tools": BEDROCK_TOOLS}
                )
            except Exception as e2:
                return {"error": f"Bedrock error: {str(e2)}", "status": "fallback"}

        elapsed = round((time.perf_counter() - t0) * 1000, 2)
        out_msg = resp.get("output", {}).get("message", {})
        contents = out_msg.get("content", [])

        action = "CONVERSE"
        reply_texts = []
        tool_results = []

        for item in contents:
            if "text" in item:
                # Filter out raw internal thinking tags if emitted
                clean_text = re.sub(r"<thinking>.*?</thinking>", "", item["text"], flags=re.DOTALL).strip()
                if clean_text:
                    reply_texts.append(clean_text)
            if "toolUse" in item:
                tool_use = item["toolUse"]
                tool_name = tool_use.get("name")
                tool_args = tool_use.get("input", {})
                action = tool_name.upper()
                result_str = self.execute_tool(tool_name, tool_args)
                tool_results.append(result_str)

        final_reply = ""
        if tool_results:
            final_reply = " · ".join(tool_results)
            if reply_texts:
                final_reply += f" — {reply_texts[0]}"
        elif reply_texts:
            final_reply = reply_texts[0]
        else:
            final_reply = "Command acknowledged by Bedrock Cyber Intelligence."

        return {
            "reply": f"☁️ [Bedrock Nova] {final_reply}",
            "engine": "bedrock",
            "model": "amazon.nova-lite",
            "action": action,
            "status": "ok",
            "latency_ms": elapsed
        }
