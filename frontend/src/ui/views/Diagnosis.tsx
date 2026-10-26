import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowsClockwise } from "@phosphor-icons/react";
import { useHub } from "../../lib/store";
import { DIAGS, type Diag } from "../../lib/types";
import { DIAG_COLOR, DIAG_NAME, clamp } from "../../lib/format";
import { reloadModel } from "../../lib/api";
import { Bezel, CountUp, useRaf } from "../kit";
import { Styled } from "../DiagCard";
import Shell, { rise } from "./Shell";

const CX = 170, CY = 170, RAD = 120;
const ang = (i: number) => (-90 + i * 72) * (Math.PI / 180);
const pt = (i: number, r: number) => `${(CX + Math.cos(ang(i)) * r).toFixed(1)},${(CY + Math.sin(ang(i)) * r).toFixed(1)}`;

/** Five-axis radar of the classifier's probabilities; the polygon eases toward each new reading at 60 fps. */
function Radar() {
  const poly = useRef<SVGPolygonElement>(null);
  const dots = useRef<(SVGCircleElement | null)[]>([]);
  const cur = useRef<number[]>(DIAGS.map(() => 0));
  const snap = useHub((s) => s.snap);
  const held = snap?.held ?? "nominal";
  const color = DIAG_COLOR[held];

  useRaf((dt) => {
    const probs = useHub.getState().snap?.probs;
    DIAGS.forEach((d, i) => { cur.current[i] += ((probs?.[d] ?? 0) - cur.current[i]) * (1 - Math.exp(-7 * dt)); });
    poly.current?.setAttribute("points", DIAGS.map((_, i) => pt(i, 14 + cur.current[i] * (RAD - 14))).join(" "));
    DIAGS.forEach((_, i) => {
      const el = dots.current[i]; if (!el) return;
      const r = 14 + cur.current[i] * (RAD - 14);
      el.setAttribute("cx", String(CX + Math.cos(ang(i)) * r)); el.setAttribute("cy", String(CY + Math.sin(ang(i)) * r));
    });
  });

  return (
    <svg viewBox="-60 0 460 340" className="mx-auto w-full max-w-[520px]">
      <defs>
        <radialGradient id="radarFill" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor={color} stopOpacity=".05" /><stop offset="1" stopColor={color} stopOpacity=".4" /></radialGradient>
      </defs>
      {[0.25, 0.5, 0.75, 1].map((k) => <polygon key={k} points={DIAGS.map((_, i) => pt(i, 14 + k * (RAD - 14))).join(" ")} fill="none" stroke="rgba(255,255,255,.07)" />)}
      {DIAGS.map((_, i) => <line key={i} x1={CX} y1={CY} x2={CX + Math.cos(ang(i)) * RAD} y2={CY + Math.sin(ang(i)) * RAD} stroke="rgba(255,255,255,.05)" />)}
      <polygon ref={poly} fill="url(#radarFill)" stroke={color} strokeWidth="1.8" strokeLinejoin="round" style={{ filter: `drop-shadow(0 0 10px ${color})`, transition: "stroke .8s" }} />
      {DIAGS.map((d, i) => <circle key={d} ref={(el) => { dots.current[i] = el; }} r="4" fill={DIAG_COLOR[d]} style={{ filter: `drop-shadow(0 0 6px ${DIAG_COLOR[d]})` }} />)}
      {DIAGS.map((d, i) => {
        const x = CX + Math.cos(ang(i)) * (RAD + 26), y = CY + Math.sin(ang(i)) * (RAD + 22);
        const on = d === held;
        return <text key={d} x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize="11" fontWeight={on ? 600 : 500} fill={on ? DIAG_COLOR[d] : "#8d92a3"} style={{ transition: "fill .6s" }}>{DIAG_NAME[d]}</text>;
      })}
    </svg>
  );
}

function Meter({ label, value, text, pos, tone, center = false }: { label: string; value?: number; text: string; pos: number; tone: string; center?: boolean }) {
  void value;
  const p = clamp(pos, 0, 1);
  return (
    <div>
      <div className="flex items-baseline justify-between"><span className="text-[12px]" style={{ color: "var(--muted)" }}>{label}</span><span className="mono text-[13px] font-medium">{text}</span></div>
      <div className="relative mt-2 h-[5px] rounded-full" style={{ background: "rgba(255,255,255,.06)" }}>
        <motion.div className="absolute top-0 h-full rounded-full" animate={center ? { left: `${Math.min(p, 0.5) * 100}%`, width: `${Math.abs(p - 0.5) * 100}%`, background: tone } : { left: 0, width: `${p * 100}%`, background: tone }}
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }} style={{ boxShadow: `0 0 12px ${tone}` }} />
      </div>
    </div>
  );
}

const RULES: { d: Diag; when: string }[] = [
  { d: "auth_fail", when: "A password-style disconnect reason shows up while the node is offline" },
  { d: "ap_down", when: "Connected less than half the time, or the router is reported missing" },
  { d: "fading", when: "Average signal below -80 dBm, or falling fast while under -70 dBm" },
  { d: "congestion", when: "Packet loss above 20 %, or ping above 150 ms, with the link still up" },
  { d: "nominal", when: "None of the above: the link is healthy" },
];

export default function Diagnosis() {
  const snap = useHub((s) => s.snap);
  const source = useHub((s) => s.source);
  const [busy, setBusy] = useState(false);
  const f = snap?.features;
  const held = snap?.held ?? "nominal";
  const conf = snap?.probs[held] ?? 0;
  const model = snap?.model;
  const rssi = f?.rssi_now;
  const tone = (good: boolean, warn: boolean) => (good ? "#52e08f" : warn ? "#ffb347" : "#ff5c6c");

  return (
    <Shell eyebrow="Diagnosis" title="How it" accent="decides"
      lead="Every half second the hub condenses five seconds of link health into a few numbers and hands them to a classifier. Its answer is the only thing the agent acts on.">
      <div className="grid gap-4 md:grid-cols-12 md:gap-5">
        <motion.div {...rise(0)} className="md:col-span-7">
          <Bezel>
            <div className="p-5 md:p-7">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="label">Right now</div>
                  <div className="mt-2 text-[clamp(1.8rem,3.4vw,2.6rem)] font-semibold leading-none tracking-[-0.04em]" style={{ color: DIAG_COLOR[held] }}><Styled name={DIAG_NAME[held]} /></div>
                </div>
                <div className="text-right"><CountUp value={conf * 100} className="mono text-[34px] font-medium tracking-tight" /><span className="mono text-[14px]" style={{ color: "var(--muted)" }}> %</span><div className="label">confidence</div></div>
              </div>
              <div className="mt-2"><Radar /></div>
            </div>
          </Bezel>
        </motion.div>

        <motion.div {...rise(1)} className="flex md:col-span-5">
          <Bezel className="fill flex-1">
            <div className="p-5 md:p-7">
              <div className="label">What it sees</div>
              <div className="mt-5 space-y-5">
                <Meter label="Signal strength" text={rssi === undefined ? "–" : `${rssi.toFixed(0)} dBm`} pos={((rssi ?? -100) + 100) / 70} tone={tone((rssi ?? -100) > -65, (rssi ?? -100) > -80)} />
                <Meter label="Signal trend" text={f?.rssi_slope === undefined ? "–" : `${f.rssi_slope >= 0 ? "+" : ""}${f.rssi_slope.toFixed(1)} dB/s`} pos={0.5 + (f?.rssi_slope ?? 0) / 12} tone={tone((f?.rssi_slope ?? 0) > -1, (f?.rssi_slope ?? 0) > -2.5)} center />
                <Meter label="Ping to laptop" text={f?.rtt_mean === undefined ? "–" : f.rtt_mean >= 999 ? "no reply" : `${f.rtt_mean.toFixed(0)} ms`} pos={(f?.rtt_mean ?? 0) / 400} tone={tone((f?.rtt_mean ?? 0) < 80, (f?.rtt_mean ?? 0) < 150)} />
                <Meter label="Packet loss" text={f?.loss_mean === undefined ? "–" : `${f.loss_mean.toFixed(0)} %`} pos={(f?.loss_mean ?? 0) / 100} tone={tone((f?.loss_mean ?? 0) < 5, (f?.loss_mean ?? 0) < 20)} />
                <Meter label="Time connected" text={f?.connected_frac === undefined ? "–" : `${(f.connected_frac * 100).toFixed(0)} %`} pos={f?.connected_frac ?? 0} tone={tone((f?.connected_frac ?? 0) > 0.95, (f?.connected_frac ?? 0) > 0.5)} />
                <div className="flex items-baseline justify-between border-t pt-4" style={{ borderColor: "var(--hair)" }}>
                  <span className="text-[12px]" style={{ color: "var(--muted)" }}>Last disconnect</span><span className="text-[12.5px] font-medium">{snap?.node.reason ?? "none"}</span>
                </div>
              </div>
            </div>
          </Bezel>
        </motion.div>

        <motion.div {...rise(2)} className="md:col-span-12">
          <Bezel>
            <div className="grid gap-6 p-5 md:grid-cols-12 md:p-7">
              <div className="md:col-span-5">
                <div className="label">The brain</div>
                <div className="mt-2 text-[20px] font-semibold tracking-[-0.03em]">{model?.source === "model" ? model.detail : <>Hand-written <span className="serif" style={{ fontSize: "1.1em" }}>rules</span></>}</div>
                <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--muted)" }}>
                  {model?.source === "model"
                    ? `Trained on ${model.samples} labelled readings. ${(model.accuracy! * 100).toFixed(0)}% accurate on recording sessions it never saw.`
                    : source === "demo" ? "The demo simulator uses the same five rules as the hub's fallback. Train a real model from the Teach tab on live data." : "No trained model yet, so these five rules decide, top to bottom. Record some failures in the Teach tab and train one."}
                </p>
                {source === "live" && (
                  <button className="pill mt-4" onClick={async () => { setBusy(true); try { await reloadModel(); } finally { setBusy(false); } }}>
                    Reload model <span className="ico"><ArrowsClockwise size={14} weight="light" className={busy ? "animate-spin" : ""} /></span>
                  </button>
                )}
              </div>
              <div className="md:col-span-7">
                {model?.importances ? (
                  <div className="space-y-2.5">
                    <div className="label">What the model leans on</div>
                    {model.importances.slice(0, 6).map(([k, v]) => (
                      <div key={k} className="grid grid-cols-[130px_1fr_40px] items-center gap-3 text-[12px]">
                        <span className="mono truncate" style={{ color: "var(--muted)" }}>{k}</span>
                        <div className="h-[4px] rounded-full" style={{ background: "rgba(255,255,255,.06)" }}><div className="h-full rounded-full" style={{ width: `${Math.min(100, v * 250)}%`, background: "var(--accent)", boxShadow: "0 0 10px var(--accent)" }} /></div>
                        <span className="mono text-right">{(v * 100).toFixed(0)}%</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ol className="space-y-1.5">
                    {RULES.map((r, i) => {
                      const on = r.d === held;
                      return (
                        <li key={r.d} className="flex items-start gap-4 rounded-2xl px-4 py-3 transition-all duration-700" style={{ background: on ? "rgba(255,255,255,.05)" : "transparent", border: `1px solid ${on ? "var(--hair)" : "transparent"}`, boxShadow: on ? `inset 3px 0 0 ${DIAG_COLOR[r.d]}` : "none" }}>
                          <span className="mono mt-0.5 text-[11px]" style={{ color: "var(--faint)" }}>{i + 1}</span>
                          <div><div className="text-[13px] font-semibold" style={{ color: on ? DIAG_COLOR[r.d] : "var(--ink)" }}>{DIAG_NAME[r.d]}</div><div className="mt-0.5 text-[12px] leading-snug" style={{ color: "var(--muted)" }}>{r.when}</div></div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </div>
            </div>
          </Bezel>
        </motion.div>
      </div>
    </Shell>
  );
}
