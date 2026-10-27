import * as THREE from "three";
import { useHub, type PathKind } from "../lib/store";
import { COLOR } from "../lib/format";

export function makeCanvasTexture(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { canvas, ctx, tex };
}

const PATH_COLOR: Record<PathKind, string> = { wifi: COLOR.wifi, radio: COLOR.radio, both: COLOR.both };
const FONT = '"Geist Variable", system-ui, sans-serif';
const MONO = '"Geist Mono Variable", ui-monospace, monospace';

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath(); ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

/** The phone's screen: a Wi-Fi glyph that loses bars as the signal fades, or a cross / padlock when it is gone. */
export function drawPhone(ctx: CanvasRenderingContext2D, w: number, h: number, bars: number, mode: "ok" | "down" | "auth", rssi: number | null) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, "#0b0f1a"); g.addColorStop(1, "#060810");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const accent = mode === "ok" ? COLOR.wifi : COLOR.bad;
  const glow = ctx.createRadialGradient(w / 2, h * 0.42, 10, w / 2, h * 0.42, w * 0.8);
  glow.addColorStop(0, accent + "40"); glow.addColorStop(1, "transparent");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, w, h);

  ctx.fillStyle = "#9aa3b8"; ctx.font = `500 ${w * 0.075}px ${FONT}`; ctx.textAlign = "center";
  ctx.fillText("Personal Hotspot", w / 2, h * 0.14);

  const cx = w / 2, cy = h * 0.55, R = w * 0.34;
  ctx.lineCap = "round"; ctx.lineWidth = w * 0.045;
  for (let i = 0; i < 3; i++) {
    const r = R * (0.45 + i * 0.28), on = mode === "ok" && bars > i;
    ctx.strokeStyle = on ? COLOR.wifi : "rgba(255,255,255,.10)";
    ctx.shadowColor = on ? COLOR.wifi : "transparent"; ctx.shadowBlur = on ? 16 : 0;
    ctx.beginPath(); ctx.arc(cx, cy + R * 0.28, r, Math.PI * 1.22, Math.PI * 1.78); ctx.stroke();
  }
  ctx.shadowBlur = 0;
  ctx.fillStyle = mode === "ok" && bars > 0 ? COLOR.wifi : "rgba(255,255,255,.18)";
  ctx.beginPath(); ctx.arc(cx, cy + R * 0.34, w * 0.034, 0, 7); ctx.fill();

  if (mode !== "ok") {
    ctx.strokeStyle = COLOR.bad; ctx.lineWidth = w * 0.05; ctx.shadowColor = COLOR.bad; ctx.shadowBlur = 20;
    if (mode === "down") { ctx.beginPath(); ctx.moveTo(cx - R * 0.8, cy - R * 0.55); ctx.lineTo(cx + R * 0.8, cy + R * 0.85); ctx.stroke(); }
    else {
      ctx.fillStyle = COLOR.bad; roundRect(ctx, cx - w * 0.1, cy + R * 0.05, w * 0.2, w * 0.15, 8); ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy + R * 0.05, w * 0.07, Math.PI, 0); ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }
  ctx.fillStyle = mode === "ok" ? "#cdd5e6" : COLOR.bad; ctx.font = `600 ${w * 0.085}px ${MONO}`;
  ctx.fillText(mode === "down" ? "router off" : mode === "auth" ? "password changed" : rssi === null ? "–" : `${rssi.toFixed(0)} dBm`, w / 2, h * 0.92);
}

/** The laptop's screen: a miniature of the hub: delivered / lost counters and the live sensor trace coloured by path. */
export function drawLaptop(ctx: CanvasRenderingContext2D, w: number, h: number, t: number) {
  const st = useHub.getState();
  const snap = st.snap;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#0a0e1a"); g.addColorStop(1, "#05060b");
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);

  ctx.textAlign = "left"; ctx.fillStyle = "#6b7388"; ctx.font = `500 ${h * 0.045}px ${FONT}`;
  ctx.fillText("LINK DOCTOR  ·  HUB", w * 0.06, h * 0.12);
  ctx.textAlign = "right"; ctx.fillStyle = st.source === "live" ? COLOR.good : COLOR.radio;
  ctx.fillText(st.source === "live" ? "● LIVE" : "● DEMO", w * 0.94, h * 0.12);

  const total = snap?.total ?? 0, lost = snap?.lost ?? 0;
  ctx.textAlign = "left"; ctx.fillStyle = "#eceef5"; ctx.font = `600 ${h * 0.25}px ${FONT}`;
  ctx.fillText(String(total), w * 0.06, h * 0.45);
  ctx.fillStyle = "#6b7388"; ctx.font = `500 ${h * 0.05}px ${FONT}`;
  ctx.fillText("readings delivered", w * 0.06, h * 0.53);
  ctx.textAlign = "right"; ctx.fillStyle = lost === 0 ? COLOR.good : COLOR.bad;
  ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 24;
  ctx.font = `600 ${h * 0.25}px ${FONT}`; ctx.fillText(String(lost), w * 0.94, h * 0.45);
  ctx.shadowBlur = 0; ctx.fillStyle = "#6b7388"; ctx.font = `500 ${h * 0.05}px ${FONT}`;
  ctx.fillText("lost", w * 0.94, h * 0.53);

  // live trace
  const pts = st.sensors.slice(-44);
  const x0 = w * 0.06, x1 = w * 0.94, y0 = h * 0.62, y1 = h * 0.93;
  ctx.strokeStyle = "rgba(255,255,255,.06)"; ctx.lineWidth = 1;
  for (let i = 0; i <= 2; i++) { const y = y0 + ((y1 - y0) * i) / 2; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); }
  ctx.lineWidth = h * 0.012; ctx.lineCap = "round";
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    ctx.strokeStyle = PATH_COLOR[b.path]; ctx.shadowColor = PATH_COLOR[b.path]; ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.moveTo(x0 + ((i - 1) / 43) * (x1 - x0), y1 - (a.v / 4095) * (y1 - y0));
    ctx.lineTo(x0 + (i / 43) * (x1 - x0), y1 - (b.v / 4095) * (y1 - y0)); ctx.stroke();
  }
  ctx.shadowBlur = 0;
  void t;
}
