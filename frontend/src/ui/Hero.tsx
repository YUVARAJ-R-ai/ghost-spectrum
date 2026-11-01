import { AnimatePresence, motion } from "framer-motion";
import { Broadcast, WifiHigh, WarningCircle, Lock } from "@phosphor-icons/react";
import { useHub } from "../lib/store";
import { useLink } from "../lib/linkState";
import { Bezel, RiseText } from "./kit";
import SensorWaveform from "./SensorWaveform";

type Tone = "good" | "bad" | "warn" | "off";
const TONE: Record<Tone, string> = { good: "var(--good)", bad: "var(--bad)", warn: "var(--warn)", off: "var(--faint)" };

/** The headline: one status you can read from across a room, the live sensor, and one line per board. */
export default function Hero() {
  const link = useLink();
  const snap = useHub((s) => s.snap);
  const sensor = snap?.node.sensor ?? 1023;
  const near = sensor < 450;
  const Icon = link.kind === "radio" ? Broadcast : link.kind === "alert" ? Lock : link.kind === "wifi" ? WifiHigh : WarningCircle;

  const boards: { name: string; state: string; tone: Tone }[] = [
    { name: "Sensor", ...(snap?.node.online ? (near ? { state: "Something close", tone: "warn" as Tone } : { state: "Watching", tone: "good" as Tone }) : { state: "Offline", tone: "off" as Tone }) },
    { name: "Supervisor", ...(snap?.gateway.online ? (snap.gateway.alert && snap.gateway.alert !== "NOMINAL" ? { state: "Alarm", tone: "bad" as Tone } : { state: "Calm", tone: "good" as Tone }) : { state: "Offline", tone: "off" as Tone }) },
    { name: "Sentinel", ...(snap?.sentinel.online ? (snap.sentinel.fault ? { state: "Jamming", tone: "bad" as Tone } : { state: "Clear air", tone: "good" as Tone }) : { state: "Offline", tone: "off" as Tone }) },
  ];

  return (
    <motion.section initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.1, delay: 0.25, ease: [0.32, 0.72, 0, 1] }}
      className="relative md:absolute md:bottom-7 md:left-7 md:w-[420px]">
      <Bezel>
        <div className="p-5 md:p-6">
          <div className="flex items-start justify-between gap-3">
            <div role="status" aria-live="polite" className="min-h-[2.8rem] font-semibold leading-[1.02] tracking-[-0.045em]"
              style={{ color: "var(--accent)", textShadow: "0 0 40px var(--accent-soft), 0 0 2px var(--accent-soft)", fontSize: link.label.length > 14 ? "clamp(1.55rem,2.7vw,2.15rem)" : "clamp(1.9rem,3.4vw,2.8rem)" }}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={link.label} exit={{ opacity: 0, y: -14, filter: "blur(6px)" }} transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}>
                  <RiseText text={link.label} />
                </motion.div>
              </AnimatePresence>
            </div>
            <Icon size={24} weight="light" className="mt-1 shrink-0" style={{ color: "var(--accent)", filter: "drop-shadow(0 0 8px var(--accent))" }} />
          </div>

          <div className="mt-4">
            <SensorWaveform />
          </div>

          <div className="mt-4 grid grid-cols-3 gap-px overflow-hidden rounded-2xl" style={{ background: "var(--hair)" }}>
            {boards.map((b) => (
              <div key={b.name} className="px-3.5 py-2.5" style={{ background: "rgba(10,11,16,.96)" }}>
                <div className="text-[12px]" style={{ color: "var(--muted)" }}>{b.name}</div>
                <div className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[13px] font-medium" style={{ color: TONE[b.tone] }}>
                  <i className={`inline-block h-2 w-2 shrink-0 rounded-full ${b.tone === "bad" ? "breathe" : ""}`}
                    style={{ background: TONE[b.tone], boxShadow: b.tone === "off" ? "none" : `0 0 8px ${TONE[b.tone]}` }} />
                  {b.state}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Bezel>
    </motion.section>
  );
}
