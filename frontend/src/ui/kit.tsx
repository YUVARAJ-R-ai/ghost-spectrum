import { animate, useMotionValue, useTransform, motion } from "framer-motion";
import { useEffect, useRef, type ReactNode } from "react";

/** Double-bezel panel: an outer tray holding an inner glass core with its own inner highlight. */
export function Bezel({ children, className = "", coreClass = "", blur = true, tight = false, lit = true, style }:
  { children: ReactNode; className?: string; coreClass?: string; blur?: boolean; tight?: boolean; lit?: boolean; style?: React.CSSProperties }) {
  return (
    <div className={`bezel ${blur ? "glass" : ""} ${tight ? "tight" : ""} ${className}`} style={style}>
      <div className={`core ${lit ? "lit" : ""} ${coreClass}`}>{children}</div>
    </div>
  );
}

/** On/off switch whose knob glides on a spring. */
export function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} onClick={() => onChange(!on)}
      className="relative h-[22px] w-[40px] shrink-0 rounded-full transition-colors duration-500"
      style={{ background: on ? "var(--accent-soft)" : "rgba(255,255,255,.08)", border: `1px solid ${on ? "var(--accent)" : "var(--hair)"}`, boxShadow: on ? "0 0 14px -2px var(--accent)" : "none" }}>
      <motion.span className="absolute top-[2px] h-4 w-4 rounded-full" animate={{ left: on ? 20 : 2 }} transition={{ type: "spring", stiffness: 500, damping: 30 }}
        style={{ background: on ? "var(--accent)" : "#8d92a3" }} />
    </button>
  );
}

/** A number that rolls to its new value instead of snapping. */
export function CountUp({ value, digits = 0, className = "", style }: { value: number; digits?: number; className?: string; style?: React.CSSProperties }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => v.toFixed(digits));
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.9, ease: [0.32, 0.72, 0, 1] });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span className={className} style={style}>{text}</motion.span>;
}

/** Splits a label into letters that rise out of a mask one after another when it changes. */
export function RiseText({ text, className = "", style }: { text: string; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={className} style={{ display: "inline-flex", overflow: "hidden", paddingBottom: ".12em", marginBottom: "-.12em", ...style }} aria-label={text}>
      {[...text].map((ch, i) => (
        <motion.span key={`${text}-${i}`} aria-hidden initial={{ y: "105%", opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.8, delay: i * 0.03, ease: [0.32, 0.72, 0, 1] }} style={{ display: "inline-block", whiteSpace: "pre" }}>
          {ch}
        </motion.span>
      ))}
    </span>
  );
}

/** Fades and lifts its children into view the first time they scroll on screen. */
export function Reveal({ children, delay = 0, className = "" }: { children: ReactNode; delay?: number; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 24, filter: "blur(10px)" }} whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      viewport={{ once: true, margin: "-40px" }} transition={{ duration: 0.9, delay, ease: [0.32, 0.72, 0, 1] }}>
      {children}
    </motion.div>
  );
}

/** requestAnimationFrame loop that survives re-renders and stops on unmount. */
export function useRaf(fn: (dt: number, t: number) => void) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    let id = 0, last = performance.now();
    const loop = (t: number) => { const dt = Math.min(0.1, (t - last) / 1000); last = t; ref.current(dt, t / 1000); id = requestAnimationFrame(loop); };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);
}
