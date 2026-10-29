import { useState, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Lock, WarningOctagon, X } from "@phosphor-icons/react";
import { useHub } from "../lib/store";

const COPY = {
  auth: { Icon: Lock, title: "Password rejected", body: "The router refuses this node's Wi-Fi password. Retrying will never fix it: a human must update the credentials." },
  deauth: { Icon: WarningOctagon, title: "Channel Anomaly Detected", body: "Node 3 Sentinel detected channel jamming / deauth frames on this network." },
} as const;

/** Slides in under the nav when the agent needs a human. */
export default function AlertBanner() {
  const alert = useHub((s) => s.snap?.alert ?? null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (alert && dismissed !== alert) {
      setDismissed(null);
    }
  }, [alert]);

  const c = (alert && dismissed !== alert) ? COPY[alert] : null;

  return (
    <div className="pointer-events-none fixed left-0 right-0 top-[76px] z-20 flex justify-center px-4 md:top-[84px]">
      <AnimatePresence mode="wait">
        {c && (
          <motion.div key={alert} initial={{ opacity: 0, y: -24, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.98 }} transition={{ type: "spring", stiffness: 260, damping: 26 }} className="pointer-events-auto w-full max-w-[560px]">
            <div className="bezel tight" style={{ background: "rgba(255,92,108,.08)", borderColor: "rgba(255,92,108,.3)", boxShadow: "0 0 60px -10px rgba(255,92,108,.5)" }}>
              <div className="core flex items-start justify-between gap-3 px-4 py-3.5" style={{ background: "linear-gradient(180deg, rgba(54,16,24,.9), rgba(24,9,14,.94))" }}>
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full breathe" style={{ background: "rgba(255,92,108,.16)", color: "var(--bad)" }}><c.Icon size={20} weight="light" /></span>
                  <div>
                    <div className="text-[13px] font-semibold tracking-[-0.01em]" style={{ color: "#ffd9de" }}>{c.title}</div>
                    <p className="mt-0.5 text-[12px] leading-snug" style={{ color: "#d9a6ae" }}>{c.body}</p>
                  </div>
                </div>
                <button onClick={() => setDismissed(alert)} className="grid h-7 w-7 shrink-0 place-items-center rounded-full hover:bg-white/10 text-white/60 hover:text-white transition-colors" aria-label="Dismiss alert">
                  <X size={15} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
