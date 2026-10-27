import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useUi } from "../lib/store";

/** One quiet line telling people the stage is interactive. Goes away after a few seconds or the first touch. */
export default function Hint() {
  const [show, setShow] = useState(true);
  const view = useUi((s) => s.view);
  useEffect(() => {
    const hide = () => setShow(false);
    const t = setTimeout(hide, 11000);
    window.addEventListener("pointerdown", hide, { once: true }); window.addEventListener("wheel", hide, { once: true });
    return () => { clearTimeout(t); window.removeEventListener("pointerdown", hide); window.removeEventListener("wheel", hide); };
  }, []);
  return (
    <AnimatePresence>
      {show && view === "stage" && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.9, delay: 3, ease: [0.32, 0.72, 0, 1] }}
          className="pointer-events-none fixed bottom-7 left-1/2 z-10 hidden -translate-x-1/2 md:block">
          <span className="eyebrow !tracking-[0.14em]">Drag to orbit · scroll to zoom · click a node</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
