import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useHub } from "../../lib/store";
import { COLOR, DIAG_COLOR, DIAG_NAME } from "../../lib/format";
import { useRaf, Bezel } from "../kit";
import Shell, { rise } from "./Shell";

const RANGES = [{ s: 30, label: "30 s" }, { s: 60, label: "1 min" }, { s: 180, label: "3 min" }];
const PATH_COLOR = { wifi: COLOR.wifi, radio: COLOR.radio, both: COLOR.both } as const;
const RSSI_MIN = -100, RSSI_MAX = -30, DROP = -88;

function Chart({ range }: { range: number }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cv = useRef<HTMLCanvasElement>(null);
  const tip = useRef<HTMLDivElement>(null);
  const mouse = useRef<{ x: number; y: number } | null>(null);

  useRaf(() => {
    const c = cv.current, w = wrap.current; if (!c || !w) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = w.clientWidth, H = w.clientHeight;
    if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    const g = c.getContext("2d")!;
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const st = useHub.getState();
    if (!st.snap) return;
    const now = st.snap.now + (performance.now() - st.snapAt) / 1000;
    const L = 8, R = 46, T = 34, B = 28, pw = W - L - R, ph = H - T - B;
    const x = (t: number) => L + pw * (1 - (now - t) / range);
    const yRtt = (v: number) => T + ph * (1 - Math.min(Math.max(v, 0), 200) / 200);
    const yRssi = (d: number) => T + ph * (1 - (d - RSSI_MIN) / (RSSI_MAX - RSSI_MIN));

    g.font = "500 10px 'Geist Mono Variable', monospace";
    // drop zone: where signal drops
    const dz = g.createLinearGradient(0, yRssi(DROP), 0, yRssi(RSSI_MIN));
    dz.addColorStop(0, "rgba(255,92,108,0)"); dz.addColorStop(1, "rgba(255,92,108,.13)");
    g.fillStyle = dz; g.fillRect(L, yRssi(DROP), pw, yRssi(RSSI_MIN) - yRssi(DROP));
    g.fillStyle = "rgba(255,92,108,.55)"; g.textAlign = "left"; g.fillText("DROP ZONE (-88dBm)", L + 8, yRssi(DROP) + 14);

    // grid + axes
    g.strokeStyle = "rgba(255,255,255,.05)"; g.lineWidth = 1; g.fillStyle = "#5b5f6e"; g.textAlign = "left";
    for (let i = 0; i <= 4; i++) {
      const yy = T + (ph * i) / 4;
      g.beginPath(); g.moveTo(L, yy); g.lineTo(L + pw, yy); g.stroke();
      g.fillText(`${Math.round(RSSI_MAX - ((RSSI_MAX - RSSI_MIN) * i) / 4)}dBm`, L + pw + 8, yy + 3);
    }
    g.textAlign = "center";
    const step = range <= 30 ? 5 : range <= 60 ? 10 : 30;
    for (let s = 0; s <= range; s += step) {
      const xx = x(now - s);
      g.strokeStyle = "rgba(255,255,255,.03)"; g.beginPath(); g.moveTo(xx, T); g.lineTo(xx, T + ph); g.stroke();
      g.fillText(s ? `-${s}s` : "now", Math.min(xx, W - R - 6), H - 8);
    }

    // problem bands
    for (const b of st.bands) {
      const x0 = Math.max(L, x(b.start)), x1 = Math.min(L + pw, x(b.end ?? now));
      if (x1 <= L || x0 >= L + pw) continue;
      const col = DIAG_COLOR[b.diag];
      const bg = g.createLinearGradient(0, T, 0, T + ph);
      bg.addColorStop(0, col + "26"); bg.addColorStop(1, col + "05");
      g.fillStyle = bg; g.fillRect(x0, T, x1 - x0, ph);
      g.fillStyle = col; g.fillRect(x0, T, x1 - x0, 2);
      if (x1 - x0 > 40) {
        g.save(); g.beginPath(); g.rect(x0, T, x1 - x0, 24); g.clip();
        g.textAlign = "left"; g.font = "600 10px 'Geist Variable', sans-serif"; g.fillText(DIAG_NAME[b.diag].toUpperCase(), x0 + 8, T + 16);
        g.restore(); g.font = "500 10px 'Geist Mono Variable', monospace";
      }
    }

    // RSSI trace (dashed line)
    const hs = st.hist.filter((p) => p.t > now - range - 2).sort((a, b) => a.t - b.t);
    if (hs.length > 1) {
      g.strokeStyle = "rgba(236,238,245,.45)"; g.lineWidth = 1.4; g.setLineDash([2, 4]); g.beginPath();
      hs.forEach((p, i) => (i ? g.lineTo(x(p.t), yRssi(p.rssi)) : g.moveTo(x(p.t), yRssi(p.rssi))));
      g.stroke(); g.setLineDash([]);
    }

    // Network Ping / Latency line (ms)
    g.lineCap = "round"; g.lineJoin = "round";
    for (let i = 1; i < hs.length; i++) {
      const a = hs[i - 1], p = hs[i];
      const col = p.rtt > 150 ? COLOR.bad : p.rtt > 60 ? COLOR.warn : COLOR.wifi;
      const area = g.createLinearGradient(0, yRtt(Math.max(a.rtt, p.rtt)), 0, T + ph);
      area.addColorStop(0, col + "30"); area.addColorStop(1, col + "00");
      g.fillStyle = area; g.beginPath(); g.moveTo(x(a.t), yRtt(a.rtt)); g.lineTo(x(p.t), yRtt(p.rtt)); g.lineTo(x(p.t), T + ph); g.lineTo(x(a.t), T + ph); g.closePath(); g.fill();
      g.strokeStyle = col; g.lineWidth = 2.4; g.shadowColor = col; g.shadowBlur = 12;
      g.beginPath(); g.moveTo(x(a.t), yRtt(a.rtt)); g.lineTo(x(p.t), yRtt(p.rtt)); g.stroke();
    }
    g.shadowBlur = 0;

    // lost readings
    for (const t of st.lostMarks) {
      const xx = x(t); if (xx < L || xx > L + pw) continue;
      g.strokeStyle = COLOR.bad; g.setLineDash([3, 3]); g.lineWidth = 1.5; g.beginPath(); g.moveTo(xx, T); g.lineTo(xx, T + ph); g.stroke(); g.setLineDash([]);
    }

    // crosshair + tooltip
    const m = mouse.current, tp = tip.current;
    if (m && tp && m.x > L && m.x < L + pw && hs.length) {
      const tAt = now - range * (1 - (m.x - L) / pw);
      let best = hs[0]; for (const p of hs) if (Math.abs(p.t - tAt) < Math.abs(best.t - tAt)) best = p;
      const bx = x(best.t);
      const col = best.rtt > 150 ? COLOR.bad : best.rtt > 60 ? COLOR.warn : COLOR.wifi;
      g.strokeStyle = "rgba(255,255,255,.25)"; g.lineWidth = 1; g.beginPath(); g.moveTo(bx, T); g.lineTo(bx, T + ph); g.stroke();
      g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 14;
      g.beginPath(); g.arc(bx, yRtt(best.rtt), 4.5, 0, 7); g.fill(); g.shadowBlur = 0;
      tp.style.opacity = "1";
      tp.style.transform = `translate(${Math.min(bx + 14, W - 190)}px, ${Math.max(T, Math.min(yRtt(best.rtt) - 40, T + ph - 96))}px)`;
      tp.innerHTML = `<div style="color:#8d92a3;font-size:10px;letter-spacing:.16em;text-transform:uppercase;margin-bottom:6px">${new Date(best.t * 1000).toLocaleTimeString()}</div>
        <div style="display:flex;justify-content:space-between;gap:18px"><span>Network Latency</span><b class="mono">${best.rtt.toFixed(1)} ms</b></div>
        <div style="display:flex;justify-content:space-between;gap:18px"><span>Signal RSSI</span><b class="mono">${best.rssi.toFixed(0)} dBm</b></div>
        <div style="display:flex;justify-content:space-between;gap:18px"><span>Packet Loss</span><b class="mono">${best.loss}%</b></div>
        <div style="display:flex;justify-content:space-between;gap:18px"><span>Link Quality</span><b style="color:${col}">${best.rtt < 50 ? "Optimal" : best.rtt < 120 ? "Nominal" : "Degraded"}</b></div>`;
    } else if (tp) tp.style.opacity = "0";
  });

  return (
    <div ref={wrap} className="relative h-[clamp(300px,52vh,480px)] w-full"
      onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); mouse.current = { x: e.clientX - r.left, y: e.clientY - r.top }; }}
      onPointerLeave={() => (mouse.current = null)}>
      <canvas ref={cv} className="absolute inset-0 h-full w-full" />
      <div ref={tip} className="pointer-events-none absolute left-0 top-0 w-[176px] rounded-2xl px-3.5 py-3 text-[12px] opacity-0 transition-opacity duration-300"
        style={{ background: "rgba(14,15,22,.92)", border: "1px solid var(--hair)", boxShadow: "0 20px 40px -12px rgba(0,0,0,.8)" }} />
    </div>
  );
}

// Events worth showing to an audience, in plain words. Anything not listed (command bookkeeping,
// config changes) stays out of the list; ?dev shows everything.
const EVENT_TEXT: Record<string, (detail: string) => string> = {
  SENTINEL_FAULT_INJECTED: () => "Board 3 detected a jamming attack",
  SENTINEL_FAULT_CLEARED: () => "Attack over, back to normal",
  SUPERVISOR_MANUAL_TRIGGER: () => "Incident reported with board 2's button",
  CLUSTER_THREAT_SIMULATION: () => "Attack simulated from the dashboard",
  THREAT_ALERT: () => "Attack simulated by the assistant",
  CLUSTER_ALERTS_CLEARED: () => "Everything reset",
  ALERT_CLEARED: () => "Everything reset",
  SUPERVISOR_BUZZER_TEST: () => "Alarm test",
  BUZZER_TEST: () => "Alarm test",
  OPTICAL_BASELINE_REZERO: () => "Sensor calibrated",
  CALIBRATE_SENSOR: () => "Sensor calibrated",
  LED_CONTROL: () => "Lights switched",
  OPERATOR_COMMAND: (d) => `Asked the assistant: ${d.replace(/^\[[A-Z]+\]\s*/, "").replace(/^'|'$/g, "")}`,
  WIFI_RECOVERY_CONFIRMED: () => "Wi-Fi recovered",
  BOOT: () => "Dashboard started",
};
const EVENT_TONE: Record<string, string> = {
  SENTINEL_FAULT_INJECTED: "var(--bad)", SUPERVISOR_MANUAL_TRIGGER: "var(--bad)", CLUSTER_THREAT_SIMULATION: "var(--bad)", THREAT_ALERT: "var(--bad)",
  SENTINEL_FAULT_CLEARED: "var(--good)", CLUSTER_ALERTS_CLEARED: "var(--good)", ALERT_CLEARED: "var(--good)", WIFI_RECOVERY_CONFIRMED: "var(--good)",
  SUPERVISOR_BUZZER_TEST: "var(--warn)", BUZZER_TEST: "var(--warn)", OPERATOR_COMMAND: "var(--accent)",
};
const DEV = new URLSearchParams(location.search).has("dev");

export default function Timeline() {
  const [range, setRange] = useState(60);
  const [, force] = useState(0);
  useEffect(() => { const id = setInterval(() => force((n) => n + 1), 1000); return () => clearInterval(id); }, []);

  return (
    <Shell title="What" accent="happened"
      actions={
        <div className="bezel tight"><div className="core flex p-0.5" style={{ borderRadius: 999 }}>
          {RANGES.map((r) => (
            <button key={r.s} onClick={() => setRange(r.s)} className="relative rounded-full px-4 py-2 text-[12px] font-medium transition-colors duration-500" style={{ color: range === r.s ? "var(--ink)" : "var(--muted)" }}>
              {range === r.s && <motion.span layoutId="rangepill" className="absolute inset-0 rounded-full" style={{ background: "rgba(255,255,255,.1)" }} transition={{ type: "spring", stiffness: 400, damping: 34 }} />}
              <span className="relative">{r.label}</span>
            </button>
          ))}
        </div></div>
      }>
      <motion.div {...rise(0)}>
        <EventLog />
      </motion.div>
      <motion.div {...rise(1)} className="mt-4">
        <Bezel>
          <div className="p-4 md:p-6">
            <div className="mb-3 text-[13px]" style={{ color: "var(--muted)" }}>Wi-Fi signal and every reading from the sensor board</div>
            <Chart range={range} />
          </div>
        </Bezel>
      </motion.div>
    </Shell>
  );
}

function EventLog() {
  const events = useHub((s) => s.snap?.events ?? []);
  const shown = events.filter((e) => DEV || (e.kind || e.type || "") in EVENT_TEXT).slice(0, 40);

  return (
    <Bezel tight lit={false}>
      <div className="scroll-thin max-h-[420px] space-y-1.5 overflow-y-auto p-4 md:p-5">
        {shown.length === 0 ? (
          <div className="py-10 text-center text-[13px]" style={{ color: "var(--muted)" }}>Nothing yet. Press a button on a board or on the Live page.</div>
        ) : (
          shown.map((e, i) => {
            const k = (e.kind || e.type || "EVENT").toUpperCase();
            const d = e.detail || e.msg || "";
            const text = EVENT_TEXT[k] ? EVENT_TEXT[k](d) : `${k}: ${d}`;
            const tone = EVENT_TONE[k] ?? "var(--muted)";
            const time = new Date(e.t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
            return (
              <div key={`${e.t}-${i}`} className="flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px]"
                style={{ background: "rgba(255,255,255,.02)", border: "1px solid var(--hair)" }}>
                <i className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: tone, boxShadow: `0 0 8px ${tone}` }} />
                <span className="mono shrink-0 text-[12px]" style={{ color: "var(--faint)" }}>{time}</span>
                <span className="truncate">{text}</span>
              </div>
            );
          })
        )}
      </div>
    </Bezel>
  );
}
