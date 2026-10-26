// In-browser stand-in for the whole hub + Node A, so the dashboard works with no hardware and no
// server. It is a TypeScript port of tools/fake_node.py, brain.rule_diagnose and brain.Agent, and it
// emits the same Snapshot the real hub does.
import { create } from "zustand";
import { sealOf } from "./hash";
import { DIAGS, type AgentEntry, type Diag, type Features, type Report, type Snapshot } from "./types";
import { useHub } from "./store";

export type Scenario = Diag | "deauth";
export const SCENARIOS: { id: Scenario; label: string }[] = [
  { id: "nominal", label: "Healthy" }, { id: "fading", label: "Signal fading" },
  { id: "congestion", label: "Congested" }, { id: "ap_down", label: "Router gone" },
  { id: "auth_fail", label: "Password rejected" }, { id: "deauth", label: "Deauth attack" },
];

// The scripted five-minute demo, played on a loop until the viewer picks a scenario by hand.
export const STORY: { s: Scenario; secs: number; title: string; caption: string }[] = [
  { s: "nominal", secs: 9, title: "All quiet", caption: "Readings flow over Wi-Fi. Every one is confirmed by the laptop." },
  { s: "fading", secs: 14, title: "Walking away with the phone", caption: "Signal slides toward the drop zone. The agent moves traffic to radio before Wi-Fi breaks." },
  { s: "nominal", secs: 10, title: "Back in range", caption: "Four healthy seconds, then the agent hands the node back to Wi-Fi." },
  { s: "congestion", secs: 11, title: "Everyone streams video", caption: "Wi-Fi is up but choked. The agent halves the send rate instead of fleeing to radio." },
  { s: "nominal", secs: 9, title: "Traffic clears", caption: "Full send rate restored." },
  { s: "ap_down", secs: 13, title: "The hotspot switches off", caption: "The router is gone, not weak. The node rides on radio and keeps counting." },
  { s: "nominal", secs: 10, title: "Hotspot returns", caption: "The node rejoins Wi-Fi by itself. An incident report is sealed." },
  { s: "auth_fail", secs: 11, title: "The password changes", caption: "Retrying will never work. The agent stops guessing and calls a human." },
  { s: "nominal", secs: 9, title: "Credentials fixed", caption: "Back to normal." },
  { s: "deauth", secs: 11, title: "An attacker floods the air", caption: "The air watcher sees deauth frames: an attack, not a fault." },
  { s: "nominal", secs: 9, title: "The attack stops", caption: "Link recovers. Loop restarts." },
];

interface DemoCtl {
  scenario: Scenario; story: boolean; chapter: number; chapterT: number;
  pick: (s: Scenario) => void; playStory: () => void;
}
export const useDemo = create<DemoCtl>((set) => ({
  scenario: "nominal", story: true, chapter: 0, chapterT: 0,
  pick: (scenario) => { set({ scenario, story: false }); sim.since = now(); },
  playStory: () => { sim.since = now(); set({ story: true, chapter: 0, chapterT: 0, scenario: STORY[0].s }); },
}));

const now = () => Date.now() / 1000;
const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());

// ---------- brain port ----------
const AUTH = new Set([2, 15, 202, 204]);
const NO_AP = new Set([200, 201]);
const REASON: Record<number, string> = {
  0: "none", 2: "auth expired", 3: "kicked by router", 15: "4-way handshake timeout (wrong password?)",
  200: "beacon timeout (router silent)", 201: "no AP found", 202: "auth failed",
};
const DROP_RSSI = -88;

interface Pkt { t: number; rssi: number; rtt: number; loss: number; reason: number; connected: number }

function slope(ts: number[], ys: number[]) {
  const n = ts.length;
  if (n < 3) return 0;
  const mt = ts.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let num = 0, den = 0;
  ts.forEach((t, i) => { num += (t - mt) * (ys[i] - my); den += (t - mt) ** 2; });
  return den ? num / den : 0;
}

function extract(w: Pkt[]): Features {
  const avg = (k: keyof Pkt) => w.reduce((a, p) => a + p[k], 0) / w.length;
  const reasons = new Set(w.map((p) => p.reason).filter((r) => r !== 0));
  const has = (set: Set<number>) => [...reasons].some((r) => set.has(r));
  const other = [...reasons].some((r) => !AUTH.has(r) && !NO_AP.has(r));
  const rssi = w.map((p) => p.rssi);
  return {
    rssi_now: rssi[rssi.length - 1], rssi_mean: avg("rssi"), rssi_min: Math.min(...rssi),
    rssi_slope: slope(w.map((p) => p.t), rssi), rtt_mean: avg("rtt"), rtt_max: Math.max(...w.map((p) => p.rtt)),
    loss_now: w[w.length - 1].loss, loss_mean: avg("loss"), connected_frac: avg("connected"),
    reason_auth: +has(AUTH), reason_no_ap: +has(NO_AP), reason_other: +other,
  };
}

function ruleDiagnose(f: Features): Diag {
  if (f.reason_auth && f.connected_frac < 1) return "auth_fail";
  if (f.connected_frac < 0.5 || f.reason_no_ap) return "ap_down";
  if (f.rssi_mean < -80 || (f.rssi_slope < -1.5 && f.rssi_now < -70)) return "fading";
  if (f.loss_mean > 20 || f.rtt_mean > 150) return "congestion";
  return "nominal";
}

// ---------- the simulated world ----------
class Sim {
  since = now();
  private seq = 0;
  private nextPkt = 0;
  private interval = 0.5;
  private forcedRadio = false;
  private slowRate = false;
  private mode: "wifi" | "radio" = "wifi";
  private why = "";
  private lastConnected = now();
  private win: Pkt[] = [];
  private seen = new Map<number, { t: number; v: number; paths: Set<string> }>();
  private pendingRadio: { at: number; seq: number }[] = [];
  private probs = Object.fromEntries(DIAGS.map((d) => [d, d === "nominal" ? 1 : 0])) as Record<Diag, number>;
  private features: Partial<Features> = {};
  private recent: string[] = [];
  private held: Diag = "nominal";
  private nominalSince: number | null = null;
  private log: AgentEntry[] = [];
  private alert: "auth" | "deauth" | null = null;
  private incident: { start: number; diagnoses: string[]; actions: string[]; peak_conf: number } | null = null;
  private reports: Report[] = [];
  private sensorBase = Math.random() * 10;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastPublish = 0;
  private lastReason = 0;
  private lastRadioAt = now();

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.tick(), 100);
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = null; }

  private scenario(): Scenario {
    const d = useDemo.getState();
    if (d.story) {
      let t = now() - this.storyT0;
      const total = STORY.reduce((a, c) => a + c.secs, 0);
      t %= total;
      let i = 0;
      while (t >= STORY[i].secs) { t -= STORY[i].secs; i++; }
      if (d.chapter !== i || Math.abs(d.chapterT - t) > 0.15) useDemo.setState({ chapter: i, chapterT: t, scenario: STORY[i].s });
      if (this.curChapter !== i) { this.curChapter = i; this.since = now(); }
      return STORY[i].s;
    }
    return d.scenario;
  }
  private storyT0 = now();
  private curChapter = -1;
  restartStory() { this.storyT0 = now(); this.curChapter = -1; }

  private tick() {
    const t = now();
    if (t >= this.nextPkt) { this.nextPkt = t + this.interval; this.packet(t); }
    // late radio resends (store-and-forward) arrive 0.8 s after the unconfirmed Wi-Fi send
    this.pendingRadio = this.pendingRadio.filter((p) => {
      if (t < p.at) return true;
      const r = this.seen.get(p.seq);
      if (r) r.paths.add("radio"); else this.seen.set(p.seq, { t, v: 0, paths: new Set(["radio"]) });
      this.lastRadioAt = t;
      return false;
    });
    if (t - this.lastPublish >= 0.2) { this.lastPublish = t; this.publish(t); }
  }

  private packet(t: number) {
    const sc = this.scenario();
    const age = t - this.since;
    this.seq++;
    const sensor = Math.round(Math.min(4095, Math.max(0, 2000 + 900 * Math.sin(t / 3 + this.sensorBase) + 250 * Math.sin(t * 1.7) + gauss() * 40)));
    let rssi = -48 + gauss() * 2, rtt = 25 + gauss() * 5, loss = 0, reason = 0, connected = true;
    if (sc === "fading") { rssi = -50 - 4 * age + gauss() * 1.5; connected = rssi > DROP_RSSI; reason = connected ? 0 : 200; }
    else if (sc === "congestion") { rtt = 220 + gauss() * 60; loss = [10, 20, 30, 40][Math.floor(Math.random() * 4)]; }
    else if (sc === "ap_down") { connected = false; reason = age < 3 ? 200 : 201; }
    else if (sc === "auth_fail") { connected = false; reason = 15; }
    else if (sc === "deauth") { connected = Math.random() > 0.65; reason = connected ? 0 : 3; rssi = -52 + gauss() * 2; rtt = connected ? 90 + gauss() * 30 : 25; }
    if (!connected) { rssi = -100; rtt = 1000; loss = 100; }
    if (connected) this.lastConnected = t;
    this.lastReason = reason;

    // node reflex: no Wi-Fi means radio; the agent can force radio early
    const prevMode = this.mode;
    this.mode = !connected || this.forcedRadio ? "radio" : "wifi";
    if (this.mode === "radio") this.why = this.forcedRadio && connected ? "agent" : "wifi lost";
    else this.why = prevMode === "radio" ? "recovered" : this.why === "recovered" && age < 5 ? "recovered" : "";

    const paths = new Set<string>();
    const delivered = connected && Math.random() * 100 >= loss;
    if (delivered) paths.add("wifi");
    if (this.mode === "radio") { paths.add("radio"); this.lastRadioAt = t; }
    else if (!delivered) this.pendingRadio.push({ at: t + 0.8, seq: this.seq });
    else if (this.seq % 10 === 0) this.lastRadioAt = t;
    if (paths.size) this.seen.set(this.seq, { t, v: sensor, paths });
    // the sensor value of late-resent readings
    if (!paths.size) this.seen.set(this.seq, { t: t + 0.8, v: sensor, paths: new Set() });

    this.win.push({ t, rssi, rtt, loss, reason, connected: connected ? 1 : 0 });
    while (this.win.length && t - this.win[0].t > 5) this.win.shift();
    if (this.win.length >= 3) {
      this.features = extract(this.win);
      this.diagnose(sc);
    }
    if (this.seen.size > 600) { for (const k of [...this.seen.keys()].slice(0, 100)) this.seen.delete(k); this.dropped += 100; }
  }

  private diagnose(sc: Scenario) {
    const f = this.features as Features;
    const label = ruleDiagnose(f);
    // soft probabilities so the bars breathe like a real model's
    const target = Object.fromEntries(DIAGS.map((d) => [d, d === label ? 0.8 + Math.random() * 0.14 : 0])) as Record<Diag, number>;
    const rest = 1 - target[label];
    const others = DIAGS.filter((d) => d !== label);
    const w = others.map(() => Math.random() + 0.2); const ws = w.reduce((a, b) => a + b);
    others.forEach((d, i) => (target[d] = (rest * w[i]) / ws));
    for (const d of DIAGS) this.probs[d] += (target[d] - this.probs[d]) * 0.55;
    this.agentStep(sc, label);
  }

  private note(saw: string, think: string, did: string) {
    this.log.unshift({ t: now(), saw, think, did });
    this.log.length = Math.min(this.log.length, 30);
  }

  private sendCmd(): boolean { return now() - this.lastConnected < 2; }

  private agentStep(sc: Scenario, label: Diag) {
    const f = this.features as Features;
    const conf = this.probs[label];
    this.recent.push(conf >= 0.5 ? label : "unsure");
    if (this.recent.length > 3) this.recent.shift();
    const stable = (conf >= 0.5 && this.recent.filter((r) => r === label).length >= 2 ? label : this.held) as Diag;
    const changed = stable !== this.held;
    this.held = stable;
    const t = now();
    if (stable !== "nominal") this.nominalSince = null;
    else if (this.nominalSince === null) this.nominalSince = t;
    const saw = `RSSI ${f.rssi_now.toFixed(0)} dBm (${f.rssi_slope >= 0 ? "+" : ""}${f.rssi_slope.toFixed(1)} dB/s), ping ${f.rtt_mean.toFixed(0)} ms, loss ${f.loss_mean.toFixed(0)}%`;
    const air = this.air(sc);

    if (air.deauth > 20 && this.alert !== "deauth") {
      this.alert = "deauth";
      this.note(`Air watcher sees ${air.deauth.toFixed(0)} deauth frames/s on ch 6`, "Someone is forcing devices off this network: an attack, not a fault", "Flagged for a human; node will ride it out on radio");
    }
    if (stable !== "nominal") {
      if (!this.incident) this.incident = { start: t, diagnoses: [], actions: [], peak_conf: 0 };
      if (!this.incident.diagnoses.includes(stable)) this.incident.diagnoses.push(stable);
      this.incident.peak_conf = Math.max(this.incident.peak_conf, conf);
    }
    if (stable === "fading" && !this.forcedRadio) {
      const ttd = f.rssi_slope < -0.3 ? (f.rssi_now - DROP_RSSI) / -f.rssi_slope : null;
      if (this.sendCmd()) {
        this.forcedRadio = true;
        this.incident?.actions.push("pre-emptive switch to 433 MHz");
        const when = ttd && ttd < 60 ? `link likely to drop in ~${ttd.toFixed(0)} s` : "link heading for the drop zone";
        this.note(saw, `Signal is fading (${(conf * 100).toFixed(0)}% sure): ${when}`, "Moved data onto 433 MHz radio before Wi-Fi breaks (make-before-break)");
      }
    } else if (stable === "congestion" && !this.slowRate && changed) {
      if (this.sendCmd()) {
        this.slowRate = true; this.interval = 1;
        this.incident?.actions.push("halved send rate");
        this.note(saw, `Wi-Fi is up but choked (${(conf * 100).toFixed(0)}% sure); the full stream would swamp the slow radio`, "Stayed on Wi-Fi and halved the send rate; any reading Wi-Fi drops is resent over radio");
      }
    } else if (stable === "ap_down" && changed) {
      this.note(saw, `Router is gone, not just weak (${(conf * 100).toFixed(0)}% sure)`, "Node is on 433 MHz radio; it will rejoin Wi-Fi by itself when the router is back");
    } else if (stable === "auth_fail" && changed) {
      this.alert = "auth";
      this.note(saw, `Router is rejecting the password (${(conf * 100).toFixed(0)}% sure). Retrying will never fix this`, "Data stays on radio; raised an alert: a human must update the Wi-Fi credentials");
    } else if (stable === "nominal" && this.nominalSince && t - this.nominalSince >= 4) {
      const undo: string[] = [];
      if (this.forcedRadio && this.sendCmd()) { this.forcedRadio = false; undo.push("Released the node back to Wi-Fi"); }
      if (this.slowRate && this.sendCmd()) { this.slowRate = false; this.interval = 0.5; undo.push("Restored full send rate"); }
      if (this.forcedRadio || this.slowRate) return;
      this.nominalSince = Infinity;
      this.alert = null;
      if (undo.length || this.incident) this.note(saw, "Link has been healthy for 4 s", undo.join("; ") || "Closed the incident");
      this.closeIncident();
    }
  }

  private closeIncident() {
    const inc = this.incident;
    if (!inc) return;
    this.incident = null;
    const end = now();
    const radio = [...this.seen.values()].filter((r) => r.t >= inc.start && r.paths.size === 1 && r.paths.has("radio")).length;
    const d = new Date(inc.start * 1000);
    const p = (n: number) => String(n).padStart(2, "0");
    const body = {
      incident_id: `INC-${Math.floor(inc.start)}`,
      started_iso: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`,
      duration_s: Math.round((end - inc.start) * 10) / 10,
      diagnoses: inc.diagnoses,
      peak_confidence: Math.round(inc.peak_conf * 100) / 100,
      agent_actions: inc.actions.length ? inc.actions : ["none needed: node reflex handled it"],
      readings_carried_by_radio: radio,
      readings_lost: 0,
    };
    // sealed exactly the way server/forensic.py seals it, so the Incidents view can re-verify it
    sealOf(body).then((sha256) => {
      this.reports.unshift({ ...body, sha256: sha256 ?? "unavailable-without-https" });
      this.reports.length = Math.min(this.reports.length, 10);
    });
  }

  private air(sc: Scenario) {
    return {
      frames: sc === "congestion" ? 900 + gauss() * 80 : 160 + gauss() * 25,
      deauth: sc === "deauth" ? 55 + gauss() * 10 : Math.max(0, 0.3 + gauss() * 0.3),
    };
  }

  private publish(t: number) {
    const sc = this.scenario();
    const air = this.air(sc);
    const readings: Snapshot["readings"] = [];
    for (const [seq, r] of this.seen) {
      if (t - r.t < 60 && r.paths.size) readings.push([seq, +r.t.toFixed(2), r.v, [...r.paths].sort().join("+")]);
    }
    const snap: Snapshot = {
      now: t,
      node: { online: true, mode: this.mode, why: this.why, path: this.mode, reason: REASON[this.lastReason] ?? String(this.lastReason) },
      wifi_age: t - this.lastConnected,
      radio_age: Math.max(0, t - this.lastRadioAt),
      gateway: { online: true, relay: this.mode === "radio" ? 1 : 0, ok: this.seq, bad: 0 },
      sentinel: { online: true, port: "/dev/ttyUSB1" },
      air: { ch: 6, frames_per_s: air.frames, deauth_per_s: air.deauth },
      readings,
      lost: 0,
      total: this.seen.size + this.dropped,
      features: this.features,
      probs: { ...this.probs },
      held: this.held,
      model: { source: "rules", detail: "demo simulator (hand rules)" },
      agent: [...this.log],
      alert: this.alert,
      incident: this.incident ? { ...this.incident } : null,
      reports: [...this.reports],
      recording: { label: null, rows: 0 },
    };
    useHub.getState().apply(snap, "demo");
  }
  private dropped = 0;
}

export const sim = new Sim();
