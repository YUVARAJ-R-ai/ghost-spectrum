import { AnimatePresence, motion } from "framer-motion";
import { Play, ShieldCheck, ShieldSlash } from "@phosphor-icons/react";
import { useHub } from "../lib/store";
import { SCENARIOS, STORY, sim, useDemo } from "../lib/sim";
import { Bezel, Switch } from "./kit";

/** Demo-only controller: narrates the scripted story, or lets you trigger a failure by hand. */
export default function DemoDock() {
  const source = useHub((s) => s.source);
  const { scenario, story, chapter, chapterT, pick, playStory, protect, setProtect } = useDemo();
  if (source !== "demo") return null;
  const ch = STORY[chapter] ?? STORY[0];
  const pct = Math.min(1, chapterT / ch.secs);

  return (
    <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1, delay: 0.5, ease: [0.32, 0.72, 0, 1] }}
      className="order-first md:order-last">
      <Bezel tight>
        <div className="p-3.5 md:p-4">
          <AnimatePresence mode="wait" initial={false}>
            {story ? (
              <motion.div key={`story-${chapter}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="label">Story · {chapter + 1} of {STORY.length}</span>
                  <button onClick={() => pick(scenario)} className="label transition-colors duration-500 hover:!text-[var(--ink)]">take control</button>
                </div>
                <div className="mt-1.5 text-[17px] font-semibold tracking-[-0.025em]">{ch.title}</div>
                <p className="dock-cap mt-0.5 text-[12px] leading-snug" style={{ color: "var(--muted)" }}>{ch.caption}</p>
                <div className="mt-3 h-[2px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,.07)" }}>
                  <div className="h-full origin-left rounded-full" style={{ transform: `scaleX(${pct})`, background: "var(--accent)", boxShadow: "0 0 8px var(--accent)", transition: "transform .25s linear" }} />
                </div>
              </motion.div>
            ) : (
              <motion.div key="manual" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.45, ease: [0.32, 0.72, 0, 1] }}>
                <div className="flex items-center justify-between gap-3">
                  <span className="label">Break something</span>
                  <button className="pill !py-1 !pl-3 !pr-1 !text-[11px]" onClick={() => { sim.restartStory(); playStory(); }}>
                    Play story <span className="ico !h-6 !w-6"><Play size={11} weight="fill" /></span>
                  </button>
                </div>
                <div className="scroll-thin -mx-1 mt-2.5 flex flex-wrap gap-1 max-h-[120px] overflow-y-auto">
                  {SCENARIOS.map((s) => (
                    <button key={s.id} className={`chip ${scenario === s.id ? "on" : ""}`} onClick={() => pick(s.id)}>{s.label}</button>
                  ))}
                </div>
                {SCENARIOS.find((s) => s.id === scenario)?.desc && (
                  <p className="dock-cap mt-2 text-[11.5px] leading-snug" style={{ color: "var(--muted)" }}>
                    {SCENARIOS.find((s) => s.id === scenario)?.desc}
                  </p>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="mt-3.5 border-t pt-3" style={{ borderColor: "var(--hair)" }}>
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-[12px] font-medium" style={{ color: protect ? "var(--ink)" : "var(--bad)" }}>
                {protect ? <ShieldCheck size={16} weight="light" style={{ color: "var(--good)" }} /> : <ShieldSlash size={16} weight="light" />}
                Link Doctor protection
              </span>
              <Switch on={protect} onChange={setProtect} label="Link Doctor protection" />
            </div>
            <AnimatePresence initial={false}>
              {!protect && (
                <motion.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
                  className="dock-cap overflow-hidden text-[11.5px] leading-snug" style={{ color: "#d9a6ae" }}>
                  <span className="block pt-2">Off: this is a plain Wi-Fi node. No radio fallback, no agent. Break the link and every reading sent during the outage is lost.</span>
                </motion.p>
              )}
            </AnimatePresence>
          </div>
        </div>
      </Bezel>
    </motion.div>
  );
}
