import Hero from "./Hero";
import DiagCard from "./DiagCard";
import AgentFeed from "./AgentFeed";
import DemoDock from "./DemoDock";
import { motion } from "framer-motion";

/**
 * Desktop: panels float around the scene (hero bottom-left, one column on the right).
 * Mobile: the scene stays pinned behind a scrolling sheet; a spacer leaves the stage visible on top.
 */
export default function StageUI() {
  return (
    <div className="stage-ui fixed inset-0 z-10 overflow-y-auto overscroll-contain md:overflow-hidden" style={{ pointerEvents: "none" }}>
      <div className="h-[46dvh] md:hidden" />
      <div className="flex flex-col gap-3 px-4 pb-32 md:contents">
        <Hero />
        <motion.div initial={{ opacity: 0, y: 40, filter: "blur(12px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{ duration: 1.1, delay: 0.4, ease: [0.32, 0.72, 0, 1] }}
          className="flex min-h-0 flex-col gap-3 md:absolute md:bottom-7 md:right-7 md:top-[84px] md:w-[380px]">
          <DiagCard />
          <AgentFeed className="min-h-[120px] flex-1" />
          <DemoDock />
        </motion.div>
      </div>
    </div>
  );
}
