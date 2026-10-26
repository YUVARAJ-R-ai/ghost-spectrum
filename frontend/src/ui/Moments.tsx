import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Broadcast, CheckCircle, ShieldCheck, WifiHigh } from "@phosphor-icons/react";
import { useHub } from "../lib/store";

interface Moment { id: number; kind: "radio" | "wifi" | "sealed"; title: string; sub: string }

/** A short, big caption for the moments worth a glance: the handover, the recovery, a sealed report. */
export default function Moments() {
  const [moment, setMoment] = useState<Moment | null>(null);
  const prev = useRef<{ mode: string | null; reports: number; source: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const n = useRef(0);

  useEffect(() => {
    const show = (m: Omit<Moment, "id">) => {
      clearTimeout(timer.current);
      setMoment({ ...m, id: ++n.current });
      timer.current = setTimeout(() => setMoment(null), 3800);
    };
    const unsub = useHub.subscribe((s) => {
      const snap = s.snap; if (!snap) return;
      const cur = { mode: snap.node.mode ?? null, reports: snap.reports.length, source: s.source };
      const p = prev.current;
      prev.current = cur;
      if (!p || p.source !== cur.source) return;     // first frame, or the source just switched
      if (cur.mode && p.mode && cur.mode !== p.mode) {
        if (cur.mode === "radio") show({ kind: "radio", title: "Handover to 433 MHz", sub: snap.node.why === "agent" ? "The agent moved traffic before Wi-Fi broke" : "Wi-Fi dropped, the node switched by reflex" });
        else show({ kind: "wifi", title: "Back on Wi-Fi", sub: "The node rejoined by itself" });
      } else if (cur.reports > p.reports && snap.reports[0]) {
        const r = snap.reports[0];
        show({ kind: "sealed", title: "Incident sealed", sub: `${r.incident_id} · ${r.readings_lost} readings lost` });
      }
    });
    return () => { unsub(); clearTimeout(timer.current); };
  }, []);

  const Icon = moment?.kind === "radio" ? Broadcast : moment?.kind === "wifi" ? WifiHigh : ShieldCheck;
  const color = moment?.kind === "radio" ? "var(--radio)" : moment?.kind === "sealed" ? "var(--good)" : "var(--wifi)";
  return (
    <div className="pointer-events-none fixed left-0 right-0 top-[132px] z-[19] hidden justify-center px-4 md:flex">
      <AnimatePresence mode="wait">
        {moment && (
          <motion.div key={moment.id} initial={{ opacity: 0, y: -18, scale: 0.94 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}>
            <div className="bezel tight glass" style={{ boxShadow: `0 0 70px -14px ${color}` }}>
              <div className="core flex items-center gap-4 py-3 pl-4 pr-6" style={{ borderRadius: 999 }}>
                <span className="grid h-10 w-10 place-items-center rounded-full" style={{ background: `color-mix(in srgb, ${color} 16%, transparent)`, color }}>
                  {moment.kind === "radio" ? <><Icon size={22} weight="light" /></> : moment.kind === "sealed" ? <CheckCircle size={22} weight="light" /> : <Icon size={22} weight="light" />}
                </span>
                <div>
                  <div className="flex items-center gap-2 text-[14px] font-semibold tracking-[-0.02em]">
                    {moment.title}{moment.kind !== "sealed" && <ArrowRight size={14} weight="bold" style={{ color }} />}
                  </div>
                  <div className="text-[11.5px]" style={{ color: "var(--muted)" }}>{moment.sub}</div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
