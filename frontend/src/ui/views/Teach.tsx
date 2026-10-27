import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { ArrowsClockwise, Check, Copy, Record, Stop } from "@phosphor-icons/react";
import { useHub } from "../../lib/store";
import { DIAGS, type Diag } from "../../lib/types";
import { DIAG_COLOR, DIAG_NAME } from "../../lib/format";
import { reloadModel, setRecording } from "../../lib/api";
import { Bezel } from "../kit";
import Shell, { rise } from "./Shell";

const HOWTO: Record<Diag, string> = {
  nominal: "Leave it alone, then move the phone around normally.",
  fading: "Put the phone (not Node A) in a biscuit tin and close the lid slowly, or walk away with it.",
  congestion: "Run a speed test or 4K video on the hotspot while other devices download.",
  ap_down: "Switch the hotspot off.",
  auth_fail: "Change the hotspot password. The node keeps the old one.",
};

export default function Teach() {
  const source = useHub((s) => s.source);
  const snap = useHub((s) => s.snap);
  const [demoLabel, setDemoLabel] = useState<Diag | null>(null);
  const [demoRows, setDemoRows] = useState(0);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  // in demo mode there is no hub to write rows, so simulate the counter climbing
  useEffect(() => {
    if (tick.current) clearInterval(tick.current);
    if (source === "demo" && demoLabel) tick.current = setInterval(() => setDemoRows((n) => n + 2), 1000);
    return () => { if (tick.current) clearInterval(tick.current); };
  }, [demoLabel, source]);

  const label = source === "live" ? snap?.recording.label ?? null : demoLabel;
  const rows = source === "live" ? snap?.recording.rows ?? 0 : demoRows;
  const toggle = (d: Diag | null) => { if (source === "live") void setRecording(d); else setDemoLabel(d); };
  const cmd = "python3 tools/train.py";

  return (
    <Shell eyebrow="Teach" title="Teach it by" accent="breaking things"
      lead="Pick what you are about to do to the Wi-Fi, do it for about three minutes, then stop. Every reading is saved with that label. Record each failure twice so the final accuracy score is honest.">
      <div className="grid gap-4 md:grid-cols-12 md:gap-5">
        <div className="space-y-3 md:col-span-8">
          {DIAGS.map((d, i) => {
            const on = label === d;
            return (
              <motion.div key={d} {...rise(i)}>
                <Bezel tight lit={false}>
                  <div className="flex items-center gap-4 p-4 md:gap-5 md:p-5" style={{ background: on ? `${DIAG_COLOR[d]}12` : "transparent", transition: "background .6s" }}>
                    <span className="mono grid h-10 w-10 shrink-0 place-items-center rounded-full text-[13px]" style={{ background: `${DIAG_COLOR[d]}1c`, color: DIAG_COLOR[d], border: `1px solid ${DIAG_COLOR[d]}44` }}>{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[15px] font-semibold tracking-[-0.02em]">{DIAG_NAME[d]}</div>
                      <div className="mt-0.5 text-[12.5px] leading-snug" style={{ color: "var(--muted)" }}>{HOWTO[d]}</div>
                    </div>
                    <button onClick={() => toggle(on ? null : d)} className="pill shrink-0" style={on ? { background: "rgba(255,92,108,.16)", borderColor: "rgba(255,92,108,.4)" } : undefined}>
                      {on ? "Stop" : "Record"}
                      <span className="ico">{on ? <Stop size={13} weight="fill" style={{ color: "var(--bad)" }} /> : <Record size={14} weight="fill" style={{ color: DIAG_COLOR[d] }} />}</span>
                    </button>
                  </div>
                </Bezel>
              </motion.div>
            );
          })}
        </div>

        <div className="space-y-4 md:col-span-4">
          <motion.div {...rise(1)}>
            <Bezel>
              <div className="p-5 md:p-6">
                <div className="label">Recording</div>
                <div className="mt-3 flex items-center gap-3">
                  <span className={`inline-block h-3 w-3 rounded-full ${label ? "breathe" : ""}`} style={{ background: label ? "var(--bad)" : "#3a3d48", boxShadow: label ? "0 0 14px var(--bad)" : "none" }} />
                  <span className="text-[15px] font-semibold">{label ? DIAG_NAME[label] : "Idle"}</span>
                </div>
                <div className="mono mt-4 text-[38px] font-medium leading-none tracking-tight">{rows}</div>
                <div className="label mt-1.5">rows saved in total</div>
                {source === "demo" && <p className="mt-4 text-[12px] leading-snug" style={{ color: "var(--faint)" }}>Demo mode: the counter is simulated. Connect to a live hub to save real data.</p>}
              </div>
            </Bezel>
          </motion.div>
          <motion.div {...rise(2)}>
            <Bezel>
              <div className="p-5 md:p-6">
                <div className="label">Then train</div>
                <button onClick={() => { void navigator.clipboard?.writeText(cmd); setCopied(true); setTimeout(() => setCopied(false), 1600); }}
                  className="mono mt-3 flex w-full items-center justify-between gap-3 rounded-2xl px-4 py-3 text-left text-[12.5px] transition-colors duration-500 hover:bg-white/5" style={{ background: "rgba(255,255,255,.035)", border: "1px solid var(--hair)" }}>
                  <span>$ {cmd}</span>{copied ? <Check size={15} style={{ color: "var(--good)" }} /> : <Copy size={15} weight="light" style={{ color: "var(--muted)" }} />}
                </button>
                <p className="mt-3 text-[12px] leading-snug" style={{ color: "var(--muted)" }}>It prints the held-out accuracy and a confusion matrix. Then reload the model here.</p>
                <button className="pill mt-4" disabled={source !== "live"} style={{ opacity: source === "live" ? 1 : 0.5 }}
                  onClick={async () => { setBusy(true); try { await reloadModel(); } finally { setBusy(false); } }}>
                  Reload model <span className="ico"><ArrowsClockwise size={14} weight="light" className={busy ? "animate-spin" : ""} /></span>
                </button>
              </div>
            </Bezel>
          </motion.div>
        </div>
      </div>
    </Shell>
  );
}
