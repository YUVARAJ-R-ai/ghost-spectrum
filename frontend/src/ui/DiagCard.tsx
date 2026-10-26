import { AnimatePresence, motion } from "framer-motion";
import { useHub } from "../lib/store";
import { DIAGS } from "../lib/types";
import { DIAG_COLOR, DIAG_GIST, DIAG_NAME } from "../lib/format";
import { Bezel, CountUp } from "./kit";

const R = 36, C = 2 * Math.PI * R;

/** Last word of a name set in the serif italic, for the editorial contrast. */
export function Styled({ name }: { name: string }) {
  const parts = name.split(" ");
  const last = parts.pop();
  return <>{parts.length ? parts.join(" ") + " " : ""}<span className="serif" style={{ fontSize: "1.12em" }}>{last}</span></>;
}

export default function DiagCard() {
  const snap = useHub((s) => s.snap);
  const held = snap?.held ?? "nominal";
  const probs = snap?.probs;
  const conf = probs ? probs[held] : 0;
  const color = DIAG_COLOR[held];
  const model = snap?.model;
  const top = probs ? DIAGS.reduce((a, b) => (probs[a] >= probs[b] ? a : b)) : held;
  const leaning = top !== held && probs && probs[top] >= 0.45 ? top : null;

  return (
    <Bezel>
      <div className="p-5">
        <div className="flex items-center justify-between">
          <span className="h-card">Diagnosis</span>
          <span className="label">{model?.source === "model" ? `model · ${(model.accuracy! * 100).toFixed(0)}% held-out` : "hand rules"}</span>
        </div>
        <div className="mt-4 flex items-center gap-5">
          <div className="relative h-[92px] w-[92px] shrink-0">
            <svg viewBox="0 0 92 92" className="h-full w-full -rotate-90">
              <circle cx="46" cy="46" r={R} fill="none" stroke="rgba(255,255,255,.07)" strokeWidth="5" />
              <motion.circle cx="46" cy="46" r={R} fill="none" strokeWidth="5" strokeLinecap="round" strokeDasharray={C}
                animate={{ strokeDashoffset: C * (1 - conf), stroke: color }} transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
                style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
            </svg>
            <div className="absolute inset-0 grid place-items-center">
              <div className="text-center leading-none">
                <CountUp value={conf * 100} className="mono text-[22px] font-medium" /><span className="mono text-[11px]" style={{ color: "var(--muted)" }}>%</span>
                <div className="label mt-1 !text-[8px]">sure</div>
              </div>
            </div>
          </div>
          <div className="min-w-0">
            <motion.div key={held} initial={{ opacity: 0, y: 8, filter: "blur(6px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }} className="text-[24px] font-semibold leading-[1.05] tracking-[-0.035em]" style={{ color }}>
              <Styled name={DIAG_NAME[held]} />
            </motion.div>
            <p className="mt-1.5 text-[12px] leading-snug" style={{ color: "var(--muted)" }}>{DIAG_GIST[held]}</p>
            <AnimatePresence>
              {leaning && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }} className="overflow-hidden">
                  <span className="mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10.5px] font-medium" style={{ background: "rgba(255,255,255,.05)", color: DIAG_COLOR[leaning], border: "1px solid var(--hair)" }}>
                    <i className="inline-block h-1.5 w-1.5 rounded-full breathe" style={{ background: DIAG_COLOR[leaning] }} />confirming: {DIAG_NAME[leaning].toLowerCase()}
                  </span>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="mt-5 space-y-2.5">
          {DIAGS.map((d) => {
            const p = probs?.[d] ?? 0;
            const top = d === held;
            return (
              <div key={d} className="grid grid-cols-[104px_1fr_34px] items-center gap-3 text-[11.5px]" style={{ color: top ? "var(--ink)" : "var(--muted)" }}>
                <span className="truncate">{DIAG_NAME[d]}</span>
                <div className="h-[3px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,.06)" }}>
                  <motion.div className="h-full rounded-full" animate={{ width: `${p * 100}%`, background: top ? DIAG_COLOR[d] : "rgba(255,255,255,.22)" }}
                    transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }} style={{ boxShadow: top ? `0 0 10px ${DIAG_COLOR[d]}` : "none" }} />
                </div>
                <span className="mono text-right" style={{ color: top ? "var(--ink)" : "var(--faint)" }}>{(p * 100).toFixed(0)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </Bezel>
  );
}
