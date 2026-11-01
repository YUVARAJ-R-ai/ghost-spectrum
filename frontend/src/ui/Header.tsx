import { motion } from "framer-motion";
import { ChartLineUp, Cube, GraduationCap, ShieldCheck, Stethoscope } from "@phosphor-icons/react";
import { useHub, useUi, type View } from "../lib/store";

// Diagnosis, Incidents and Teach are developer tools: only with ?dev in the URL
const DEV = new URLSearchParams(location.search).has("dev");
const NAV: { id: View; label: string; Icon: typeof Cube }[] = [
  { id: "stage", label: "Live", Icon: Cube },
  { id: "timeline", label: "What happened", Icon: ChartLineUp },
  ...(DEV ? [{ id: "diagnosis" as View, label: "Diagnosis", Icon: Stethoscope }] : []),
  // Incidents only records Wi-Fi outages from the older single-board setup
  ...(DEV ? [{ id: "incidents" as View, label: "Incidents", Icon: ShieldCheck }] : []),
  ...(DEV ? [{ id: "teach" as View, label: "Teach", Icon: GraduationCap }] : []),
];

/** Floating glass pill: the active tab's highlight slides between items on a shared layout id. */
function Nav() {
  const view = useUi((s) => s.view);
  const setView = useUi((s) => s.setView);
  const reports = useHub((s) => s.snap?.reports.length ?? 0);
  return (
    <nav className="hit fixed bottom-[max(16px,env(safe-area-inset-bottom))] left-1/2 z-30 -translate-x-1/2 md:bottom-auto md:top-5">
      <div className="bezel tight glass"><div className="core flex items-center gap-0.5 rounded-full p-1" style={{ borderRadius: 999 }}>
        {NAV.map(({ id, label, Icon }) => {
          const on = view === id;
          return (
            <button key={id} onClick={() => setView(id)} aria-label={label} aria-current={on}
              className="relative flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-medium transition-colors duration-500 md:px-4"
              style={{ color: on ? "var(--ink)" : "var(--muted)" }}>
              {on && <motion.span layoutId="navpill" className="absolute inset-0 rounded-full"
                style={{ background: "rgba(255,255,255,.1)", boxShadow: "inset 0 1px 1px rgba(255,255,255,.14), 0 0 24px -6px var(--accent)" }}
                transition={{ type: "spring", stiffness: 380, damping: 32 }} />}
              <Icon size={18} weight="light" className="relative" />
              <span className={`relative ${on ? "" : "hidden sm:inline"}`}>{label}</span>
              {id === "incidents" && reports > 0 && <span className="relative mono rounded-full px-1.5 text-[10px]" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{reports}</span>}
            </button>
          );
        })}
      </div></div>
    </nav>
  );
}

export default function Header() {
  const source = useHub((s) => s.source);
  const wsOpen = useHub((s) => s.wsOpen);
  const setPinned = useHub((s) => s.setPinnedDemo);
  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-20 flex items-start justify-between gap-4 px-4 pt-4 md:px-7 md:pt-5">
        <div className="hit flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-[14px]" style={{ background: "rgba(255,255,255,.05)", border: "1px solid var(--hair)", boxShadow: "inset 0 1px 1px rgba(255,255,255,.12)" }}>
            <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
              <path d="M4 17h6l3.5-9 5 16 3.5-7H28" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ filter: "drop-shadow(0 0 5px var(--accent))" }} />
            </svg>
          </div>
          <div className="text-[17px] font-semibold tracking-tight">Kinesis</div>
        </div>

        <div className="hit flex items-center gap-2 md:gap-4">
          <div className="bezel tight"><div className="core flex items-center p-0.5" style={{ borderRadius: 999 }}>
            {(["live", "demo"] as const).map((k) => {
              const on = source === k;
              const disabled = k === "live" && !wsOpen;
              return (
                <button key={k} disabled={disabled} onClick={() => setPinned(k === "demo")}
                  title={disabled ? "No hub detected on this address" : k === "live" ? "Real data from the hub" : "Built-in simulator"}
                  className="relative rounded-full px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[.14em] transition-colors duration-500 disabled:cursor-not-allowed"
                  style={{ color: on ? "var(--ink)" : "var(--faint)", opacity: disabled ? 0.45 : 1 }}>
                  {on && <motion.span layoutId="srcpill" className="absolute inset-0 rounded-full" style={{ background: "var(--accent-soft)" }} transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                  <span className="relative flex items-center gap-1.5">
                    {on && <i className="inline-block h-1.5 w-1.5 rounded-full breathe" style={{ background: "var(--accent)", boxShadow: "0 0 8px var(--accent)" }} />}
                    {k === "live" ? "Live" : "Simulator"}
                  </span>

                </button>
              );
            })}
          </div></div>
        </div>
      </header>
      <Nav />
    </>
  );
}
