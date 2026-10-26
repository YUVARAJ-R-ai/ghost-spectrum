// Link Doctor dashboard: renders the hub's 5 Hz snapshots from /ws.
const $ = (id) => document.getElementById(id);
const COLORS = { wifi: "#4ea1ff", radio: "#ffb238", both: "#3fd0b5", lost: "#ff5d5d", grid: "#242c35", muted: "#8a949f" };
const NAMES = {
  nominal: "Healthy", fading: "Signal fading", congestion: "Congested",
  ap_down: "Router gone", auth_fail: "Password rejected", unsure: "Unsure",
};
const LABELS = ["nominal", "fading", "congestion", "ap_down", "auth_fail"];
const rssiHistory = [];
let last = null;

function connect() {
  const ws = new WebSocket(`ws://${location.host}/ws`);
  ws.onmessage = (e) => { last = JSON.parse(e.data); render(last); };
  ws.onclose = () => setTimeout(connect, 1000);
}

function render(s) {
  chip("chip-a", s.node.online);
  chip("chip-b", s.gateway.online);
  chip("chip-c", s.sentinel.online);

  // Which path is carrying the data right now
  const path = $("path");
  if (!s.node.online) {
    path.className = "path offline";
    $("path-label").textContent = s.total ? "NODE SILENT" : "WAITING FOR NODE A";
    $("path-why").textContent = s.total ? "no packets on Wi-Fi or radio for 3 s" : "power it on and join the hotspot";
  } else if (s.node.mode === "radio") {
    path.className = "path radio";
    $("path-label").textContent = "433 MHz RADIO";
    const why = { agent: "agent switched early: Wi-Fi is about to fail", "wifi lost": "Wi-Fi dropped, node switched by reflex",
                  "no reply": "Wi-Fi stopped answering, node switched by reflex" }[s.node.why] || s.node.why;
    $("path-why").textContent = why;
  } else {
    path.className = "path wifi";
    $("path-label").textContent = "WI-FI";
    $("path-why").textContent = s.node.why === "recovered" ? "back on Wi-Fi: rejoined automatically" : "primary link healthy";
  }

  $("delivered").textContent = s.total;
  $("lost").textContent = s.lost;
  $("lost").className = "num " + (s.lost === 0 ? "zero" : "bad");
  $("radio-age").textContent = s.radio_age == null ? "not heard yet" : s.radio_age < 6.5 ? `ready · ${s.radio_age.toFixed(0)} s ago` : `silent ${s.radio_age.toFixed(0)} s`;

  // Alert banner
  const alerts = { auth: "Wi-Fi is rejecting the node's password. Retrying won't fix it; a human must update the credentials. Data is safe on radio.",
                   deauth: "Air watcher sees a deauthentication flood: someone is attacking this network. Data is riding it out on radio." };
  $("alert").className = s.alert ? "alert" : "alert hidden";
  $("alert").textContent = s.alert ? alerts[s.alert] : "";

  renderDiagnosis(s);
  renderAgent(s.agent);
  renderHealth(s);
  renderRecording(s.recording);
  renderReports(s.reports);

  if (s.features.rssi_now !== undefined) rssiHistory.push([s.now, s.features.rssi_now]);
  while (rssiHistory.length && s.now - rssiHistory[0][0] > 60) rssiHistory.shift();
  drawChart(s);
}

function chip(id, on) { $(id).className = "chip" + (on ? " on" : ""); }

function renderDiagnosis(s) {
  const m = s.model;
  $("model-src").textContent = m.source === "model"
    ? `${m.detail} · ${(m.accuracy * 100).toFixed(0)}% accurate on unseen sessions · ${m.samples} samples`
    : "hand rules (no trained model yet)";
  $("diag-main").textContent = NAMES[s.held] || s.held;
  const top = LABELS.reduce((a, b) => (s.probs[a] >= s.probs[b] ? a : b));
  $("bars").innerHTML = LABELS.map((c) => {
    const p = s.probs[c] || 0;
    return `<div class="bar ${c === top ? "top " + c : ""}"><span>${NAMES[c]}</span>
      <div class="track"><div class="fill" style="width:${(p * 100).toFixed(0)}%"></div></div>
      <span class="pct">${(p * 100).toFixed(0)}%</span></div>`;
  }).join("");
  $("importances").innerHTML = m.importances
    ? "Model leans most on: " + m.importances.slice(0, 3).map(([k, v]) => `<b>${k}</b> ${(v * 100).toFixed(0)}%`).join(", ")
    : "";
}

let agentKey = "";
function renderAgent(log) {
  const key = log.map((e) => e.t).join();
  if (key === agentKey) return;  // only re-render on new decisions so the slide-in animation plays once
  agentKey = key;
  if (!log.length) return;
  $("agent-log").innerHTML = log.map((e) => `<div class="entry">
    <time>${new Date(e.t * 1000).toLocaleTimeString()}</time>
    <p><span>saw</span>${e.saw}</p><p><span>think</span>${e.think}</p><p><span>did</span><b>${e.did}</b></p></div>`).join("");
}

function tile(k, v, wide) { return `<div class="tile${wide ? " wide" : ""}"><div class="v">${v}</div><div class="k">${k}</div></div>`; }

function renderHealth(s) {
  const f = s.features;
  $("health").innerHTML = f.rssi_now === undefined ? '<p class="muted">waiting for packets</p>' :
    tile("signal (RSSI)", `${f.rssi_now.toFixed(0)} dBm`) +
    tile("signal trend", `${f.rssi_slope >= 0 ? "+" : ""}${f.rssi_slope.toFixed(1)} dB/s`) +
    tile("ping to laptop", f.rtt_mean >= 999 ? "no reply" : `${f.rtt_mean.toFixed(0)} ms`) +
    tile("packet loss", `${f.loss_mean.toFixed(0)} %`) +
    tile("last disconnect reason", s.node.reason || "none", true);
  const a = s.air;
  $("air").innerHTML = !s.sentinel.online ? '<p class="muted">Node C not connected (optional)</p>' :
    tile("watching channel", a.ch) + tile("frames / s", a.frames_per_s.toFixed(0)) +
    tile("deauth frames / s", a.deauth_per_s.toFixed(1), true);
}

function renderRecording(r) {
  if (!$("rec-buttons").children.length) {
    $("rec-buttons").innerHTML = LABELS.map((c) => `<button data-l="${c}">${NAMES[c]}</button>`).join("") +
      '<button data-l="">Stop</button>';
    $("rec-buttons").onclick = (e) => {
      const l = e.target.dataset.l;
      if (l === undefined) return;
      fetch("/api/record", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: l || null }) });
    };
  }
  for (const b of $("rec-buttons").children) b.classList.toggle("active", !!r.label && b.dataset.l === r.label);
  $("rec-status").textContent = r.label ? `● recording "${NAMES[r.label]}" · ${r.rows} rows total` : `${r.rows} rows recorded`;
}

let reportKey = "";
function renderReports(reports) {
  const key = reports.map((r) => r.sha256).join();
  if (key === reportKey || !reports.length) return;
  reportKey = key;
  $("reports").innerHTML = reports.map((r) => `<div class="report">
    <b>${r.incident_id}</b> · ${r.diagnoses.map((d) => NAMES[d] || d).join(" → ")} · ${r.duration_s}s<br>
    radio carried <b>${r.readings_carried_by_radio}</b>, lost <b>${r.readings_lost}</b> · ${r.agent_actions.join("; ")}
    <div class="hash">sha256 ${r.sha256}</div></div>`).join("");
}

$("reload").onclick = () => fetch("/api/model/reload", { method: "POST" });

// ---------- chart ----------
function drawChart(s) {
  const c = $("chart");
  const dpr = window.devicePixelRatio || 1;
  const w = c.clientWidth, h = c.clientHeight;
  if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
  const g = c.getContext("2d");
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const L = 44, R = 50, T = 10, B = 24, pw = w - L - R, ph = h - T - B;
  const x = (t) => L + pw * (1 - (s.now - t) / 60);
  const y = (v) => T + ph * (1 - v / 4095);
  const yr = (dbm) => T + ph * (1 - (dbm + 100) / 70);  // -100..-30 dBm on the right axis

  g.strokeStyle = COLORS.grid; g.fillStyle = COLORS.muted; g.font = "11px ui-monospace, monospace"; g.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const yy = T + (ph * i) / 4;
    g.beginPath(); g.moveTo(L, yy); g.lineTo(L + pw, yy); g.stroke();
    g.textAlign = "right"; g.fillText(Math.round(4095 * (1 - i / 4)), L - 6, yy + 4);
    g.textAlign = "left"; g.fillText(`${Math.round(-30 - 70 * (i / 4))}`, L + pw + 6, yy + 4);
  }
  g.textAlign = "center";
  for (let sec = 0; sec <= 60; sec += 10) g.fillText(sec ? `-${sec}s` : "now", x(s.now - sec), h - 6);

  // RSSI (dashed, right axis)
  g.setLineDash([3, 3]); g.strokeStyle = COLORS.muted; g.beginPath();
  rssiHistory.forEach(([t, v], i) => (i ? g.lineTo(x(t), yr(v)) : g.moveTo(x(t), yr(v))));
  g.stroke(); g.setLineDash([]);

  // Sensor reading, each segment coloured by the path that delivered it
  const pts = s.readings.slice().sort((a, b) => a[0] - b[0]);
  g.lineWidth = 2.5; g.lineCap = "round";
  for (let i = 1; i < pts.length; i++) {
    const [s0, t0, v0] = pts[i - 1], [s1, t1, v1, p1] = pts[i];
    if (s1 - s0 > 1) {  // gap in sequence numbers: readings that never arrived
      g.fillStyle = COLORS.lost; g.fillRect(x(t1) - 1, T, 2, ph);
      continue;
    }
    g.strokeStyle = p1 === "radio" ? COLORS.radio : p1 === "wifi" ? COLORS.wifi : COLORS.both;
    g.beginPath(); g.moveTo(x(t0), y(v0)); g.lineTo(x(t1), y(v1)); g.stroke();
  }
  g.save(); g.translate(12, T + ph / 2); g.rotate(-Math.PI / 2); g.fillStyle = COLORS.muted; g.textAlign = "center";
  g.fillText("IR proximity (raw ADC)", 0, 0); g.restore();
}

window.addEventListener("resize", () => last && drawChart(last));
connect();
