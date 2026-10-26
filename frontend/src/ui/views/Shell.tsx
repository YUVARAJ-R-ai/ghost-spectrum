import { motion } from "framer-motion";
import type { ReactNode } from "react";

/** Shared frame for the secondary views: a dimmed backdrop over the scene, an editorial heading, staggered content. */
export default function Shell({ eyebrow, title, accent, lead, actions, children }:
  { eyebrow: string; title: string; accent: string; lead?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.5, ease: [0.32, 0.72, 0, 1] }}
      className="fixed inset-0 z-[15] overflow-y-auto" style={{ background: "radial-gradient(130% 100% at 50% 0%, rgba(5,5,7,.9), rgba(5,5,7,.965) 65%)" }}>
      {/* content scrolls under the floating header; this fade keeps the two from printing over each other */}
      <div className="pointer-events-none fixed inset-x-0 top-0 z-[16] h-[92px]" style={{ background: "linear-gradient(#050507 62%, rgba(5,5,7,0))" }} />
      <div className="mx-auto max-w-[1180px] px-4 pb-32 pt-[92px] md:px-8 md:pb-16 md:pt-[104px]">
        <motion.header initial={{ opacity: 0, y: 24, filter: "blur(10px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.9, ease: [0.32, 0.72, 0, 1] }}
          className="flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-[640px]">
            <span className="eyebrow"><span className="dot" />{eyebrow}</span>
            <h1 className="mt-4 text-[clamp(2.2rem,5vw,3.6rem)] font-semibold leading-[1.02] tracking-[-0.045em]">
              {title} <span className="serif" style={{ fontSize: "1.1em", color: "var(--accent)" }}>{accent}</span>
            </h1>
            {lead && <p className="mt-3 max-w-[56ch] text-[14.5px] leading-relaxed" style={{ color: "var(--muted)" }}>{lead}</p>}
          </div>
          {actions}
        </motion.header>
        <div className="mt-8 md:mt-10">{children}</div>
      </div>
    </motion.div>
  );
}

export const rise = (i: number) => ({
  initial: { opacity: 0, y: 28, filter: "blur(10px)" }, animate: { opacity: 1, y: 0, filter: "blur(0px)" },
  transition: { duration: 0.9, delay: 0.12 + i * 0.09, ease: [0.32, 0.72, 0, 1] as [number, number, number, number] },
});
