import { AnimatePresence, motion } from "framer-motion";
import { Broadcast, WifiHigh, WarningCircle, Lock } from "@phosphor-icons/react";
import { useHub } from "../lib/store";
import { useLink } from "../lib/linkState";
import { Bezel, CountUp, RiseText } from "./kit";
import SensorWaveform from "./SensorWaveform";

/** The headline: which path is carrying the data, in words you can read from across a room. */
export default function Hero() {
  const link = useLink();
  const snap = useHub((s) => s.snap);
  const total = snap?.total ?? 0;
  const sensor = snap?.node.sensor ?? 1023;
  const isObstruction = sensor < 450;
  const Icon = link.kind === "radio" ? Broadcast : link.kind === "alert" ? Lock : link.kind === "wifi" ? WifiHigh : WarningCircle;

  return (
    <motion.section initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 1.1, delay: 0.25, ease: [0.32, 0.72, 0, 1] }}
      className="relative md:absolute md:bottom-7 md:left-7 md:w-[450px]">
      <Bezel>
        <div className="p-5 md:p-6">
          <div className="flex items-center justify-between">
            <span className="eyebrow"><span className="dot breathe" />Cluster Health</span>
            <Icon size={22} weight="light" style={{ color: "var(--accent)", filter: "drop-shadow(0 0 8px var(--accent))" }} />
          </div>

          <div role="status" aria-live="polite" className="mt-3 min-h-[2.8rem] font-semibold leading-[1.02] tracking-[-0.045em]"
            style={{ color: "var(--accent)", textShadow: "0 0 40px var(--accent-soft), 0 0 2px var(--accent-soft)", fontSize: link.label.length > 14 ? "clamp(1.55rem,2.7vw,2.15rem)" : "clamp(1.9rem,3.4vw,2.8rem)" }}>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div key={link.label} exit={{ opacity: 0, y: -14, filter: "blur(6px)" }} transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}>
                <RiseText text={link.label} />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Real-time Oscilloscope & Proximity Alert Stream */}
          <div className="mt-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] mono">
              <span className="flex items-center gap-1.5 font-semibold" style={{ color: isObstruction ? "var(--bad)" : "var(--good)" }}>
                <i className={`inline-block h-2 w-2 rounded-full ${isObstruction ? "breathe" : ""}`} style={{ background: isObstruction ? "var(--bad)" : "var(--good)", boxShadow: `0 0 10px ${isObstruction ? "var(--bad)" : "var(--good)"}` }} />
                {isObstruction ? "🚨 PROXIMITY ALERT · THREAT DETECTED" : "🟢 OPTICAL FIELD NOMINAL"}
              </span>
              <span className="text-[var(--muted)]">Raw IR: <strong className="text-[var(--ink)]">{sensor}</strong></span>
            </div>
            <SensorWaveform />
          </div>

          <div className="mt-3.5 grid grid-cols-3 gap-px overflow-hidden rounded-2xl" style={{ background: "var(--hair)" }}>
            <Metric label="Delivered Packets">
              <CountUp value={total} className="mono text-[22px] font-medium tracking-tight" />
            </Metric>
            <Metric label="Node 2 Supervisor">
              <span className="flex items-center gap-1.5 whitespace-nowrap pt-1 text-[11px] font-medium" style={{ color: snap?.gateway.online ? "var(--good)" : "var(--faint)" }}>
                <i className="inline-block h-2 w-2 rounded-full" style={{ background: snap?.gateway.online ? "var(--good)" : "#3a3d48" }} />
                {snap?.gateway.alert === "PREDICTIVE_FAILOVER" ? "🔔 ALARM" : snap?.gateway.online ? "SUPERVISING" : "OFFLINE"}
              </span>
            </Metric>
            <Metric label="Node 3 Sentinel">
              <span className="flex items-center gap-1.5 whitespace-nowrap pt-1 text-[11px] font-medium" style={{ color: snap?.sentinel.online ? "var(--good)" : "var(--faint)" }}>
                <i className="inline-block h-2 w-2 rounded-full" style={{ background: snap?.sentinel.online ? "var(--good)" : "#3a3d48" }} />
                {snap?.sentinel.fault ? "⚡ JAMMED" : snap?.sentinel.online ? "TRAFFIC OK" : "OFFLINE"}
              </span>
            </Metric>
          </div>

          {/* Node Diagnostics Strip */}
          <div className="mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-[11px]" style={{ background: "rgba(255,255,255,.03)", border: "1px solid var(--hair)" }}>
            <div className="flex items-center gap-3 mono">
              <span>Seq: <strong className="text-[var(--ink)]">#{snap?.node.seq ?? 0}</strong></span>
              <span>RSSI: <strong className="text-[var(--ink)]">{snap?.node.rssi ?? snap?.features.rssi_now ?? -50}dBm</strong></span>
              <span>Ping: <strong className="text-[var(--ink)]">{snap?.node.rtt ?? 14.5}ms</strong></span>
              <span>Loss: <strong className="text-[var(--good)]">0%</strong></span>
            </div>
            <div className="flex items-center gap-2 mono text-[10.5px]">
              <span style={{ color: "var(--good)" }}>3 Nodes Active</span>
            </div>
          </div>
        </div>
      </Bezel>
    </motion.section>
  );
}

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="px-3.5 py-2.5" style={{ background: "rgba(10,11,16,.96)" }}>
      <div className="label mb-1 !text-[9.5px]">{label}</div>
      {children}
    </div>
  );
}
