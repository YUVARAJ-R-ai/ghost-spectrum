import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowCounterClockwise, Pause, Play, CheckCircle, Warning, Lightning, Bell, ShieldCheck, Target } from "@phosphor-icons/react";
import { useHub } from "../lib/store";
import { triggerClusterAlert, clearClusterAlert, testSupervisorBuzzer, zeroSensor } from "../lib/api";
import { useDemo } from "../lib/sim";
import { Bezel } from "./kit";

type Action = "jam" | "alarm" | "clear" | "zero";
type Tone = "ok" | "warn" | "bad";

// One row per button: what it says, what it calls, and the message shown after
const ACTIONS: { id: Action; label: string; busy: string; Icon: typeof Bell; color: string; tint: string; run: () => Promise<unknown>; done: string; tone: Tone }[] = [
  { id: "jam", label: "Simulate attack", busy: "Starting…", Icon: Lightning, color: "var(--bad)", tint: "255,92,108", run: triggerClusterAlert, done: "Jamming attack started. It clears by itself in a few seconds.", tone: "bad" },
  { id: "alarm", label: "Test alarm", busy: "Beeping…", Icon: Bell, color: "var(--warn)", tint: "255,179,71", run: testSupervisorBuzzer, done: "Board 2 is beeping.", tone: "warn" },
  { id: "clear", label: "Reset", busy: "Resetting…", Icon: ShieldCheck, color: "var(--good)", tint: "82,224,143", run: clearClusterAlert, done: "All clear.", tone: "ok" },
  { id: "zero", label: "Calibrate sensor", busy: "Calibrating…", Icon: Target, color: "var(--accent)", tint: "100,200,255", run: zeroSensor, done: "Sensor calibrated.", tone: "ok" },
];

const TONE: Record<Tone, string> = { ok: "82,224,143", warn: "255,179,71", bad: "255,92,108" };

export default function ControlPanel() {
  const source = useHub((s) => s.source);
  const { paused, setPaused, resetScenario } = useDemo();
  const [busy, setBusy] = useState<Action | null>(null);
  const [msg, setMsg] = useState<{ text: string; tone: Tone } | null>(null);

  const show = (text: string, tone: Tone) => {
    setMsg({ text, tone });
    setTimeout(() => setMsg(null), 3000);
  };

  const run = async (a: (typeof ACTIONS)[number]) => {
    setBusy(a.id);
    try {
      await a.run();
      show(a.done, a.tone);
    } catch {
      show("Couldn't reach the hub.", "bad");
    } finally {
      setTimeout(() => setBusy(null), 800);
    }
  };

  return (
    <Bezel tight>
      <div className="p-3.5 md:p-4">
        <div className="grid grid-cols-2 gap-2">
          {ACTIONS.map((a) => (
            <button key={a.id} onClick={() => run(a)} disabled={busy === a.id}
              className="pill !w-full !justify-center !py-2.5 !text-[12.5px] font-semibold transition-all"
              style={{ color: a.color, background: `rgba(${a.tint},.08)`, borderColor: `rgba(${a.tint},.3)` }}>
              <a.Icon size={15} weight="fill" className="mr-1.5 shrink-0" />
              {busy === a.id ? a.busy : a.label}
            </button>
          ))}
        </div>

        <AnimatePresence>
          {msg && (
            <motion.div initial={{ opacity: 0, height: 0, marginTop: 0 }} animate={{ opacity: 1, height: "auto", marginTop: 10 }} exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="flex items-center gap-2 rounded-lg p-2 text-[12px] font-medium"
              style={{ background: `rgba(${TONE[msg.tone]},.14)`, color: `rgb(${TONE[msg.tone]})`, border: `1px solid rgba(${TONE[msg.tone]},.3)` }}>
              {msg.tone === "bad" ? <Warning size={14} weight="fill" className="shrink-0" /> : <CheckCircle size={14} weight="fill" className="shrink-0" />}
              {msg.text}
            </motion.div>
          )}
        </AnimatePresence>

        {source === "demo" && (
          <div className="mt-3 flex items-center justify-end gap-2 border-t pt-2.5" style={{ borderColor: "var(--hair)" }}>
            <button onClick={() => setPaused(!paused)} className="pill !py-1 !text-[11px]">
              {paused ? <Play size={11} weight="fill" /> : <Pause size={11} weight="fill" />}
              {paused ? "Resume" : "Pause"}
            </button>
            <button onClick={resetScenario} className="pill !py-1 !text-[11px]">
              <ArrowCounterClockwise size={11} /> Restart
            </button>
          </div>
        )}
      </div>
    </Bezel>
  );
}
