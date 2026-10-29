// In-browser stand-in for the whole hub + Node A + Node B, so the dashboard works with no hardware and no
// server. It implements all 10 deterministic Phase 2 scenarios and emits the exact Snapshot schema.
import { create } from "zustand";
import { sealOf } from "./hash";
import {
  DIAGS,
  type AgentEntry,
  type CmdState,
  type Diag,
  type Features,
  type HubEvent,
  type NetworkState,
  type Report,
  type Snapshot,
} from "./types";
import { useHub } from "./store";

export type Scenario =
  | "healthy_wifi"
  | "wifi_degrading"
  | "wifi_failure"
  | "radio_fallback"
  | "manual_button"
  | "force_radio_cmd"
  | "wifi_recovery_cmd"
  | "gateway_failure"
  | "total_outage"
  | "outage_recovery"
  | "nominal"
  | "fading"
  | "congestion"
  | "ap_down"
  | "auth_fail"
  | "deauth";


export const SCENARIOS: { id: Scenario; label: string; desc: string }[] = [
  { id: "healthy_wifi", label: "1. Healthy Wi-Fi", desc: "Telemetry flows via Wi-Fi direct UDP (port 4210) with low RTT and 0% loss." },
  { id: "wifi_degrading", label: "2. Wi-Fi Degradation", desc: "RTT climbs to 240ms+ and packet loss rises to 25% (WIFI_DEGRADED)." },
  { id: "wifi_failure", label: "3. Wi-Fi Failure", desc: "Direct Wi-Fi UDP drops; Node A autonomic reflex triggers fallback." },
  { id: "radio_fallback", label: "4. Radio Fallback", desc: "Node A sends 433 MHz ASK frames to Node B Gateway; forwarded to laptop." },
  { id: "manual_button", label: "5. Manual Button Press", desc: "GPIO 27 pressed: manual override latched into radio mode." },
  { id: "force_radio_cmd", label: "6. Force-Radio Cmd", desc: "Laptop issues UDP cmd 'radio': sent -> ack -> confirmed radio mode." },
  { id: "wifi_recovery_cmd", label: "7. Wi-Fi Recovery Cmd", desc: "Laptop issues cmd 'wifi': probation check passes and restores Wi-Fi." },
  { id: "gateway_failure", label: "8. Gateway Failure", desc: "Node B goes silent; 433 MHz relay telemetry stalls (DEGRADED_OFFLINE)." },
  { id: "total_outage", label: "9. Total Outage", desc: "Both Wi-Fi and Radio links down; sensor readings lost." },
  { id: "outage_recovery", label: "10. Outage Recovery", desc: "Wi-Fi and Gateway rejoin cleanly; store-and-forward avoids duplicates." },
];

export const STORY: { s: Scenario; secs: number; title: string; caption: string }[] = [
  { s: "healthy_wifi", secs: 10, title: "1. Nominal Telemetry", caption: "Sensor readings stream over Wi-Fi UDP. Immediate hub acknowledgements confirm delivery." },
  { s: "wifi_degrading", secs: 12, title: "2. Environmental Interference", caption: "RTT climbs and packet loss rises towards 25%. System enters WIFI_DEGRADED." },
  { s: "wifi_failure", secs: 10, title: "3. Sudden Wi-Fi Disconnect", caption: "Direct Wi-Fi fails completely. After ACK timeout reflex, Node A latches radio mode." },
  { s: "radio_fallback", secs: 14, title: "4. 433 MHz Radio Resiliency", caption: "Node A transmits 16-byte frames to Node B Gateway (ESP8266 + OLED); zero data lost." },
  { s: "manual_button", secs: 12, title: "5. Physical Override Triggered", caption: "GPIO 27 button pressed on Node A: latches radio transmission hardware mode." },
  { s: "force_radio_cmd", secs: 11, title: "6. Remote Force-Radio Command", caption: "Laptop operator issues remote UDP 'radio' command; acknowledged in 85ms." },
  { s: "wifi_recovery_cmd", secs: 12, title: "7. Return-to-Wi-Fi Handover", caption: "Laptop issues 'wifi' command; node undergoes probation check before switching." },
  { s: "gateway_failure", secs: 10, title: "8. Gateway Power Loss", caption: "Node B Gateway silent; radio forwarding stalls; hub detects link failure." },
  { s: "total_outage", secs: 10, title: "9. Dual Infrastructure Blackout", caption: "Both primary and secondary RF transports fail. Hub flags DEGRADED_OFFLINE." },
  { s: "outage_recovery", secs: 14, title: "10. Self-Healing Reconnection", caption: "Node and Gateway power restored; store-and-forward buffer drains without duplicates." },
];

interface DemoCtl {
  scenario: Scenario;
  story: boolean;
  chapter: number;
  chapterT: number;
  paused: boolean;
  protect: boolean;
  setPaused: (v: boolean) => void;
  setProtect: (v: boolean) => void;
  pick: (s: Scenario) => void;
  playStory: () => void;
  resetScenario: () => void;
}

export const useDemo = create<DemoCtl>((set) => ({
  scenario: "healthy_wifi",
  story: true,
  chapter: 0,
  chapterT: 0,
  paused: false,
  protect: true,
  setPaused: (paused) => set({ paused }),
  setProtect: (protect) => {
    sim.reset();
    set({ protect });
  },
  pick: (scenario) => {
    set({ scenario, story: false });
    sim.since = now();
    sim.onScenarioChange(scenario);
  },
  playStory: () => {
    sim.since = now();
    sim.restartStory();
    set({ story: true, chapter: 0, chapterT: 0, scenario: STORY[0].s });
    sim.onScenarioChange(STORY[0].s);
  },
  resetScenario: () => {
    sim.resetScenario();
  },
}));

const now = () => Date.now() / 1000;
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

const REASON_NAMES: Record<number, string> = {
  0: "NONE",
  1: "MANUAL_BUTTON",
  2: "WIFI_LOST",
  3: "ACK_TIMEOUT",
  4: "REMOTE_COMMAND",
  5: "RECOVERED",
  200: "BEACON_TIMEOUT",
};

interface Pkt {
  t: number;
  rssi: number;
  rtt: number;
  loss: number;
  reason: number;
  connected: number;
}

function extract(w: Pkt[]): Features {
  const avg = (k: keyof Pkt) => w.reduce((a, p) => a + p[k], 0) / w.length;
  const reasons = new Set(w.map((p) => p.reason).filter((r) => r !== 0));
  const rssi = w.map((p) => p.rssi);
  return {
    rssi_now: rssi[rssi.length - 1],
    rssi_mean: avg("rssi"),
    rssi_min: Math.min(...rssi),
    rssi_slope: 0,
    rtt_mean: avg("rtt"),
    rtt_max: Math.max(...w.map((p) => p.rtt)),
    loss_now: w[w.length - 1].loss,
    loss_mean: avg("loss"),
    connected_frac: avg("connected"),
    reason_auth: 0,
    reason_no_ap: +reasons.has(200),
    reason_other: +reasons.has(2),
  };
}

class Sim {
  since = now();
  private seq = 0;
  private nextPkt = 0;
  private interval = 0.5;
  private forcedRadio = false;
  private slowRate = false;
  private mode: "wifi" | "radio" = "wifi";
  private why = "";
  private lastReason = 0;
  private lastConnected = now();
  private lastRadioAt = now();
  private lastHeard = now();
  private lastSensor = 2048;
  private lastRssi = -48;
  private lastRtt = 22;
  private lastLoss = 0;
  private lostCount = 0;
  private wifiCount = 0;
  private radioCount = 0;
  private badFrames = 0;
  private gwOnline = true;
  private win: Pkt[] = [];
  private seen = new Map<number, { t: number; v: number; paths: Set<string> }>();
  private pendingRadio: { at: number; seq: number }[] = [];
  private probs = Object.fromEntries(DIAGS.map((d) => [d, d === "nominal" ? 1 : 0])) as Record<Diag, number>;
  private features: Partial<Features> = {};
  private held: Diag = "nominal";
  private log: AgentEntry[] = [];
  private events: HubEvent[] = [];
  private cmd_state: CmdState | null = null;
  private cmdCounter = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPublish = 0;
  private dropped = 0;
  private storyT0 = now();
  private curChapter = -1;
  private alert: "auth" | "deauth" | null = null;

  reset() {
    this.lostCount = 0;
    this.wifiCount = 0;
    this.radioCount = 0;
    this.forcedRadio = false;
    this.slowRate = false;
    this.interval = 0.5;
    this.mode = "wifi";
    this.why = "";
    this.lastReason = 0;
    this.pendingRadio = [];
    this.held = "nominal";
    this.events = [];
    this.cmd_state = null;
    this.alert = null;
    this.seen.clear();
    this.win = [];
  }

  resetScenario() {
    this.reset();
    this.since = now();
    this.storyT0 = now();
    this.seq = 0;
    this.logEvent("SCENARIO_RESET", "Scenario reset to initial state", "SIM");
  }

  onScenarioChange(sc: Scenario) {
    this.since = now();
    this.logEvent("SCENARIO_CHANGED", `Switched to ${sc}`, "SIM");
  }

  logEvent(type: string, msg: string, source = "HUB") {
    this.events.unshift({ t: now(), type, msg, source });
    if (this.events.length > 50) this.events.pop();
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 100);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  restartStory() {
    this.storyT0 = now();
    this.curChapter = -1;
  }

  private scenario(): Scenario {
    const d = useDemo.getState();
    if (d.story) {
      let t = now() - this.storyT0;
      const total = STORY.reduce((a, c) => a + c.secs, 0);
      t %= total;
      let i = 0;
      while (t >= STORY[i].secs) {
        t -= STORY[i].secs;
        i++;
      }
      if (d.chapter !== i || Math.abs(d.chapterT - t) > 0.15) {
        useDemo.setState({ chapter: i, chapterT: t, scenario: STORY[i].s });
      }
      if (this.curChapter !== i) {
        this.curChapter = i;
        this.since = now();
        this.logEvent("STORY_CHAPTER", STORY[i].title, "SIM");
      }
      return STORY[i].s;
    }
    return d.scenario;
  }

  execCommand(cmd: string, args?: Record<string, unknown>): Promise<{ status: string; detail?: string }> {
    const id = ++this.cmdCounter;
    const sent_at = now();

    if (cmd === "trigger_alert") {
      this.alert = "deauth";
      this.logEvent("CLUSTER_JAMMING_ANOMALY", "Channel anomaly and deauth flood triggered", "SENTINEL");
      return Promise.resolve({ status: "ok", detail: "Jamming anomaly active" });
    }
    if (cmd === "clear_alert") {
      this.alert = null;
      this.logEvent("CLUSTER_ALERTS_CLEARED", "All cluster alerts reset to nominal", "OPERATOR");
      return Promise.resolve({ status: "ok", detail: "Alerts cleared" });
    }
    if (cmd === "test_buzzer") {
      this.logEvent("SUPERVISOR_BUZZER_TEST", "Test buzzer pulse dispatched to Node 2", "SUPERVISOR");
      return Promise.resolve({ status: "ok", detail: "Supervisor alarm tested" });
    }
    if (cmd === "zero_sensor") {
      this.logEvent("OPTICAL_BASELINE_REZERO", "Baseline optical sensor calibration synchronized", "SENSOR");
      return Promise.resolve({ status: "ok", detail: "Baseline calibrated" });
    }

    if (cmd === "rate" && typeof args?.ms === "number") {
      this.interval = Math.max(0.2, (args.ms as number) / 1000);
      this.logEvent("RATE_CHANGED", `Send rate updated to ${args.ms}ms`, "OPERATOR");
      return Promise.resolve({ status: "ok", detail: `Rate set to ${args.ms}ms` });
    }

    if (cmd === "wifi" && (this.scenario() === "wifi_failure" || this.scenario() === "total_outage")) {
      this.cmd_state = {
        id,
        cmd,
        sent_at,
        status: "unreachable",
        detail: "Cannot send command: Node A Wi-Fi link is down and unreachable",
      };
      this.logEvent("COMMAND_FAILED", "Wi-Fi command rejected: device unreachable", "HUB");
      return Promise.resolve({ status: "unreachable", detail: this.cmd_state.detail });
    }

    this.cmd_state = { id, cmd, sent_at, status: "sent", detail: `Dispatched ${cmd} to Node A` };
    this.logEvent("COMMAND_SENT", `Dispatched command '${cmd}' to Node A`, "HUB");

    setTimeout(() => {
      const ack_at = now();
      const rtt_ms = Math.round((ack_at - sent_at) * 1000);
      if (this.cmd_state && this.cmd_state.id === id) {
        this.cmd_state = {
          ...this.cmd_state,
          status: "ack",
          ack_at,
          rtt_ms,
          detail: `Acknowledged in ${rtt_ms}ms`,
        };
        this.logEvent("COMMAND_ACK", `Device acknowledged '${cmd}' in ${rtt_ms}ms`, "NODE_A");

        if (cmd === "radio") {
          this.mode = "radio";
          this.lastReason = 4;
          this.why = "laptop command";
        } else if (cmd === "wifi") {
          this.mode = "wifi";
          this.lastReason = 5;
          this.why = "recovered";
        }
      }
    }, 85);

    return Promise.resolve({ status: "sent", detail: "Command sent to device" });
  }

  private tick() {
    if (useDemo.getState().paused) return;
    const t = now();
    if (t >= this.nextPkt) {
      this.nextPkt = t + this.interval;
      this.packet(t);
    }
    // drain store-and-forward radio packets
    this.pendingRadio = this.pendingRadio.filter((p) => {
      if (t < p.at) return true;
      const r = this.seen.get(p.seq);
      if (r) r.paths.add("radio");
      else this.seen.set(p.seq, { t, v: 2048, paths: new Set(["radio"]) });
      this.lastRadioAt = t;
      this.radioCount++;
      return false;
    });

    if (t - this.lastPublish >= 0.2) {
      this.lastPublish = t;
      this.publish(t);
    }
  }

  private packet(t: number) {
    const sc = this.scenario();
    const age = t - this.since;
    this.seq++;

    const sensor = Math.round(
      Math.min(4095, Math.max(0, 2048 + 1000 * Math.sin(t / 2.5) + 300 * Math.sin(t * 1.8) + gauss() * 35))
    );
    this.lastSensor = sensor;

    let rssi = -48 + gauss() * 2;
    let rtt = 22 + gauss() * 4;
    let loss = 0;
    let reason = 0;
    let connected = true;
    this.gwOnline = true;

    // Evaluate 10 scenarios
    if (sc === "healthy_wifi") {
      connected = true;
      this.mode = "wifi";
      this.why = "";
      reason = 0;
    } else if (sc === "wifi_degrading") {
      connected = true;
      this.mode = "wifi";
      rtt = 230 + gauss() * 45;
      loss = 24 + Math.floor(Math.random() * 8);
      rssi = -83 + gauss() * 2;
      this.why = "high loss/rtt";
      reason = 0;
    } else if (sc === "wifi_failure") {
      if (age < 2.0) {
        connected = false;
        loss = 100;
        reason = 200;
        this.mode = "wifi";
        this.why = "beacon timeout";
      } else {
        connected = false;
        this.mode = "radio";
        reason = 2; // WIFI_LOST
        this.why = "wifi lost";
      }
    } else if (sc === "radio_fallback") {
      connected = false;
      this.mode = "radio";
      reason = 2; // WIFI_LOST
      this.why = "wifi lost";
      loss = 0;
      rtt = 38 + gauss() * 6;
      rssi = -55 + gauss() * 3;
    } else if (sc === "manual_button") {
      connected = true;
      this.mode = "radio";
      reason = 1; // MANUAL_BUTTON
      this.why = "manual button";
      rssi = -50 + gauss() * 2;
    } else if (sc === "force_radio_cmd") {
      connected = true;
      this.mode = "radio";
      reason = 4; // REMOTE_COMMAND
      this.why = "remote command";
    } else if (sc === "wifi_recovery_cmd") {
      connected = true;
      if (age < 2.5) {
        this.mode = "wifi";
        reason = 5; // RECOVERED
        this.why = "probation";
      } else {
        this.mode = "wifi";
        reason = 5;
        this.why = "recovered";
      }
    } else if (sc === "gateway_failure") {
      connected = false;
      this.mode = "radio";
      reason = 2;
      this.why = "gateway down";
      this.gwOnline = false;
    } else if (sc === "total_outage") {
      connected = false;
      this.gwOnline = false;
      this.mode = "radio";
      reason = 2;
      this.why = "total outage";
      loss = 100;
    } else if (sc === "outage_recovery") {
      if (age < 2.0) {
        connected = true;
        this.mode = "wifi";
        reason = 5;
        this.why = "reconnecting";
      } else {
        connected = true;
        this.mode = "wifi";
        reason = 5;
        this.why = "recovered";
      }
    }

    this.lastRssi = rssi;
    this.lastRtt = rtt;
    this.lastLoss = loss;
    this.lastReason = reason;

    if (connected) this.lastConnected = t;
    this.lastHeard = t;

    const paths = new Set<string>();
    const deliveredWifi = connected && this.mode === "wifi" && Math.random() * 100 >= loss;

    if (deliveredWifi) {
      paths.add("wifi");
      this.wifiCount++;
    }

    if (this.mode === "radio") {
      if (this.gwOnline) {
        paths.add("radio");
        this.radioCount++;
        this.lastRadioAt = t;
      }
    } else if (this.mode === "wifi" && !deliveredWifi) {
      // Store-and-forward fallback to radio
      if (this.gwOnline) {
        this.pendingRadio.push({ at: t + 0.6, seq: this.seq });
      }
    }

    if (paths.size > 0) {
      this.seen.set(this.seq, { t, v: sensor, paths });
    } else if (this.mode !== "wifi" && !this.gwOnline) {
      this.lostCount++;
    } else if (sc === "total_outage") {
      this.lostCount++;
    }

    this.win.push({ t, rssi, rtt, loss, reason, connected: connected ? 1 : 0 });
    while (this.win.length && t - this.win[0].t > 5) this.win.shift();
    if (this.win.length >= 3) {
      this.features = extract(this.win);
      this.diagnose(sc);
    }

    if (this.seen.size > 500) {
      for (const k of [...this.seen.keys()].slice(0, 100)) this.seen.delete(k);
      this.dropped += 100;
    }
  }

  private diagnose(sc: Scenario) {
    let label: Diag = "nominal";
    if (sc === "wifi_degrading") label = "congestion";
    else if (sc === "wifi_failure" || sc === "total_outage") label = "ap_down";
    else if (sc === "radio_fallback" || sc === "manual_button") label = "nominal";

    this.held = label;
    const target = Object.fromEntries(DIAGS.map((d) => [d, d === label ? 0.85 : 0.03])) as Record<Diag, number>;
    for (const d of DIAGS) this.probs[d] = target[d];
  }

  private deriveNetworkState(sc: Scenario, age: number): NetworkState {
    if (sc === "total_outage" || (sc === "gateway_failure" && this.mode === "radio")) return "DEGRADED_OFFLINE";
    if (sc === "wifi_degrading") return "WIFI_DEGRADED";
    if (sc === "wifi_failure") return age < 2.0 ? "WIFI_CONNECTING" : "RADIO_ACTIVE";
    if (sc === "radio_fallback" || sc === "manual_button" || sc === "force_radio_cmd") return "RADIO_ACTIVE";
    if (sc === "wifi_recovery_cmd") return age < 2.5 ? "RECOVERY_PROBATION" : "WIFI_ACTIVE";
    if (sc === "outage_recovery") return age < 1.5 ? "RECOVERY_PENDING" : age < 3.5 ? "RECOVERY_PROBATION" : "WIFI_ACTIVE";
    return "WIFI_ACTIVE";
  }

  private publish(t: number) {
    const sc = this.scenario();
    const age = t - this.since;
    const state = this.deriveNetworkState(sc, age);

    let active_source: Snapshot["active_source"] = "NONE";
    if (state === "RADIO_ACTIVE" && this.gwOnline) {
      active_source = "NODE_B_RADIO";
    } else if (state === "WIFI_ACTIVE" || state === "WIFI_DEGRADED" || state === "RECOVERY_PROBATION") {
      active_source = "NODE_A_WIFI";
    }

    const readings: Snapshot["readings"] = [];
    for (const [seq, r] of this.seen) {
      if (t - r.t < 60 && r.paths.size) {
        readings.push([seq, +r.t.toFixed(2), r.v, [...r.paths].sort().join("+")]);
      }
    }

    const isOnline = state !== "DEGRADED_OFFLINE" && (t - this.lastHeard < 3.5);

    const snap: Snapshot = {
      now: t,
      state,
      source_type: "SIMULATED",
      active_source,
      node: {
        online: isOnline,
        mode: this.mode,
        why: this.why,
        path: this.mode,
        reason: REASON_NAMES[this.lastReason] ?? String(this.lastReason),
        seq: this.seq,
        sensor: this.lastSensor,
        rssi: Math.round(this.lastRssi),
        rtt: Math.round(this.lastRtt),
        loss: Math.round(this.lastLoss),
        ch: 6,
      },
      wifi_age: t - this.lastConnected,
      radio_age: Math.max(0, t - this.lastRadioAt),
      gateway: {
        online: this.gwOnline,
        relay: this.mode === "radio" ? 1 : 0,
        ok: this.radioCount,
        bad: this.badFrames,
        dup: 0,
        last: this.lastRadioAt,
      },
      sentinel: { online: true, port: "/dev/ttyUSB1" },
      air: { ch: 6, frames_per_s: 180, deauth_per_s: 0.2 },
      readings,
      lost: this.lostCount,
      total: this.seen.size + this.dropped,
      wifi_count: this.wifiCount,
      radio_count: this.radioCount,
      cmd_state: this.cmd_state,
      events: [...this.events],
      features: this.features,
      probs: { ...this.probs },
      held: this.held,
      model: { source: "rules", detail: "deterministic scenario engine" },
      agent: [...this.log],
      alert: this.alert,
      incident: null,
      reports: [],
      recording: { label: null, rows: 0 },
    };

    useHub.getState().apply(snap, "demo");
  }
}

export const sim = new Sim();
