import { AnimatePresence, motion } from "framer-motion";
import { Eye, Brain, Lightning } from "@phosphor-icons/react";
import { useHub } from "../lib/store";
import { timeShort } from "../lib/format";
import { Bezel } from "./kit";

/** The agent explains itself: what it saw, what it concluded, what it did. Newest decision is shown in full. */
export default function AgentFeed({ max = 5, className = "" }: { max?: number; className?: string }) {
  const log = useHub((s) => s.snap?.agent) ?? [];
  const [latest, ...older] = log;
  return (
    <Bezel className={`fill ${className}`}>
      <div className="p-5">
        <div className="flex items-center justify-between">
          <span className="h-card">Agent decisions</span>
          <span className="label">offline by design</span>
        </div>

        {!latest ? (
          <div className="mt-4">
            <div className="relative h-[3px] overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,.06)" }}>
              <span className="scan absolute inset-y-0 w-1/3 rounded-full" style={{ background: "linear-gradient(90deg, transparent, var(--accent), transparent)" }} />
            </div>
            <p className="mt-4 text-[13px] font-medium">Watching the link</p>
            <p className="mt-1 text-[12px] leading-relaxed" style={{ color: "var(--muted)" }}>
              Nothing to decide yet. The moment the signal fades, the router vanishes or the password changes, this is where the agent explains what it saw, what it thinks and what it did.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.div key={latest.t} layout initial={{ opacity: 0, y: -16, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                transition={{ duration: 0.8, ease: [0.32, 0.72, 0, 1] }} className="relative rounded-2xl p-4"
                style={{ background: "linear-gradient(135deg, var(--accent-soft), rgba(255,255,255,.02))", border: "1px solid var(--hair)" }}>
                <time className="mono mb-3 block text-[10px]" style={{ color: "var(--faint)" }}>{timeShort(latest.t)}</time>
                <Row Icon={Eye} k="saw" v={latest.saw} />
                <Row Icon={Brain} k="thinks" v={latest.think} />
                <Row Icon={Lightning} k="did" v={latest.did} strong />
              </motion.div>
            </AnimatePresence>

            {older.length > 0 && (
              <ul className="mt-3 space-y-2 pr-1">
                {older.slice(0, max).map((e) => (
                  <li key={e.t} className="flex gap-3 text-[11.5px] leading-snug" style={{ color: "var(--muted)" }}>
                    <time className="mono shrink-0 pt-px text-[10px]" style={{ color: "var(--faint)" }}>{timeShort(e.t)}</time>
                    <span className="line-clamp-2">{e.did}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Bezel>
  );
}

function Row({ Icon, k, v, strong = false }: { Icon: typeof Eye; k: string; v: string; strong?: boolean }) {
  return (
    <div className="mt-2.5 flex gap-3 first-of-type:mt-0">
      <Icon size={16} weight="light" className="mt-0.5 shrink-0" style={{ color: strong ? "var(--accent)" : "var(--faint)" }} />
      <div className="min-w-0">
        <div className="label !text-[9px]">{k}</div>
        <p className={`text-[12.5px] leading-snug ${strong ? "font-medium" : ""}`} style={{ color: strong ? "var(--ink)" : "var(--muted)" }}>{v}</p>
      </div>
    </div>
  );
}
