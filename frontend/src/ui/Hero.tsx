import { AnimatePresence, motion } from "framer-motion";
import { Broadcast, WifiHigh, WarningCircle, Lock } from "@phosphor-icons/react";
import { useHub } from "../lib/store";
import { useLink } from "../lib/linkState";
import { Bezel, CountUp, RiseText } from "./kit";

/** The headline: which path is carrying the data, in words you can read from across a room. */
export default function Hero() {
  const link = useLink();
  const snap = useHub((s) => s.snap);
  const total = snap?.total ?? 0;
  const lost = snap?.lost ?? 0;
  const radioAge = snap?.radio_age;
  const standby = radioAge == null || radioAge > 3600 ? "not heard yet" : radioAge < 6.5 ? `ready · ${radioAge.toFixed(0)}s` : `silent · ${radioAge.toFixed(0)}s`;
  const standbyOk = radioAge != null && radioAge < 6.5;
  const Icon = link.kind === "radio" ? Broadcast : link.kind === "alert" ? Lock : link.kind === "wifi" ? WifiHigh : WarningCircle;

  return (
    <motion.section initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.1, delay: 0.25, ease: [0.32, 0.72, 0, 1] }}
      className="relative md:absolute md:bottom-7 md:left-7 md:w-[440px]">
      <Bezel>
        <div className="p-5 md:p-6">
          <div className="flex items-center justify-between">
            <span className="eyebrow"><span className="dot breathe" />Active path</span>
            <Icon size={22} weight="light" style={{ color: "var(--accent)", filter: "drop-shadow(0 0 8px var(--accent))" }} />
          </div>

          <div className="mt-3.5 min-h-[3rem] text-[clamp(2rem,3.7vw,3rem)] font-semibold leading-[1.02] tracking-[-0.045em]"
            style={{ color: "var(--accent)", textShadow: "0 0 40px var(--accent-soft), 0 0 2px var(--accent-soft)" }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={link.label} exit={{ opacity: 0, y: -14, filter: "blur(6px)" }} transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}>
                <RiseText text={link.label} />
              </motion.div>
            </AnimatePresence>
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={link.why} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }} className="mt-2 min-h-[2.6em] max-w-[36ch] text-[13.5px] leading-snug" style={{ color: "var(--muted)" }}>
              {link.why}
            </motion.p>
          </AnimatePresence>

          <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-2xl" style={{ background: "var(--hair)" }}>
            <Metric label="Delivered"><CountUp value={total} className="mono text-[26px] font-medium tracking-tight" /></Metric>
            <Metric label="Lost">
              <CountUp value={lost} className="mono text-[26px] font-medium tracking-tight"
                style={{ color: lost === 0 ? "var(--good)" : "var(--bad)", textShadow: `0 0 22px ${lost === 0 ? "rgba(82,224,143,.45)" : "rgba(255,92,108,.55)"}` }} />
            </Metric>
            <Metric label="Backup">
              <span className="flex items-center gap-2 whitespace-nowrap pt-1.5 text-[12px] font-medium" style={{ color: standbyOk ? "var(--ink)" : "var(--faint)" }}>
                <i className={`inline-block h-2 w-2 rounded-full ${standbyOk ? "breathe" : ""}`} style={{ background: standbyOk ? "var(--radio)" : "#3a3d48", boxShadow: standbyOk ? "0 0 10px var(--radio)" : "none" }} />
                {standby}
              </span>
            </Metric>
          </div>
        </div>
      </Bezel>
    </motion.section>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3" style={{ background: "rgba(10,11,16,.96)" }}>
      <div className="label mb-1">{label}</div>
      {children}
    </div>
  );
}
