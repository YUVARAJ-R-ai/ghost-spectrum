import { AnimatePresence, motion } from "framer-motion";
import { X } from "@phosphor-icons/react";
import { useHub, useUi, type NodeId } from "../lib/store";
import { Bezel } from "./kit";

const TITLE: Record<NodeId, [string, string]> = {
  A: ["Node A", "IoT device · ESP32"],
  hotspot: ["The router", "Phone hotspot"],
  laptop: ["Laptop hub", "Merges both paths"],
  gateway: ["Node B", "433 MHz receiver"],
  air: ["Node C", "Air watcher"],
};

function Stat({ k, v }: { k: string; v: string }) {
  return (
    <div className="rounded-2xl px-3.5 py-3" style={{ background: "rgba(255,255,255,.035)", border: "1px solid var(--hair)" }}>
      <div className="mono text-[17px] font-medium tracking-tight">{v}</div>
      <div className="label mt-0.5 !text-[9px]">{k}</div>
    </div>
  );
}

/** Opens when you click a node in the 3D scene: just the few numbers that matter for that part. */
export default function FocusCard() {
  const focus = useUi((s) => s.focus);
  const setFocus = useUi((s) => s.setFocus);
  const snap = useHub((s) => s.snap);
  const f = snap?.features ?? {};
  const fmt = (v: number | undefined, d = 0, unit = "") => (v === undefined ? "–" : `${v.toFixed(d)}${unit}`);
  const last = snap?.readings.length ? snap.readings.reduce((a, b) => (b[0] > a[0] ? b : a)) : null;

  const stats: Record<NodeId, [string, string][]> = {
    A: [["sensor (raw ADC)", last ? String(last[2]) : "–"], ["mode", snap?.node.mode ?? "–"], ["ping to laptop", f.rtt_mean !== undefined && f.rtt_mean >= 999 ? "no reply" : fmt(f.rtt_mean, 0, " ms")], ["packet loss", fmt(f.loss_mean, 0, " %")], ["last disconnect", snap?.node.reason ?? "–"]],
    hotspot: [["signal", fmt(f.rssi_now, 0, " dBm")], ["trend", f.rssi_slope === undefined ? "–" : `${f.rssi_slope >= 0 ? "+" : ""}${f.rssi_slope.toFixed(1)} dB/s`], ["worst in 5 s", fmt(f.rssi_min, 0, " dBm")], ["channel", String(snap?.air.ch ?? "–")]],
    laptop: [["delivered", String(snap?.total ?? 0)], ["lost", String(snap?.lost ?? 0)], ["model", snap?.model.source === "model" ? "trained" : "rules"], ["agent notes", String(snap?.agent.length ?? 0)]],
    gateway: [["relay", snap?.gateway.relay ? "clicking" : "idle"], ["frames ok", String(snap?.gateway.ok ?? "–")], ["frames bad", String(snap?.gateway.bad ?? "–")], ["last heard", snap?.radio_age == null ? "–" : `${snap.radio_age.toFixed(0)} s ago`]],
    air: [["channel", String(snap?.air.ch ?? "–")], ["frames / s", fmt(snap?.air.frames_per_s, 0)], ["deauth / s", fmt(snap?.air.deauth_per_s, 1)], ["state", (snap?.air.deauth_per_s ?? 0) > 20 ? "under attack" : "quiet"]],
  };

  return (
    <AnimatePresence>
      {focus && (
        <motion.aside key={focus} initial={{ opacity: 0, x: -24, filter: "blur(10px)" }} animate={{ opacity: 1, x: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, x: -24, filter: "blur(10px)" }} transition={{ duration: 0.7, ease: [0.32, 0.72, 0, 1] }}
          className="fixed left-4 right-4 top-[76px] z-20 md:left-7 md:right-auto md:top-[92px] md:w-[300px]">
          <Bezel>
            <div className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="label">{TITLE[focus][1]}</div>
                  <div className="mt-1 text-[22px] font-semibold tracking-[-0.03em]">{TITLE[focus][0]}</div>
                </div>
                <button onClick={() => setFocus(null)} aria-label="Close" className="grid h-8 w-8 place-items-center rounded-full transition-colors duration-500 hover:bg-white/10"><X size={16} weight="light" /></button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {stats[focus].map(([k, v], i) => (
                  <div key={k} className={i === stats[focus].length - 1 && stats[focus].length % 2 ? "col-span-2" : ""}><Stat k={k} v={v} /></div>
                ))}
              </div>
            </div>
          </Bezel>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
