import { Suspense, lazy, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useHubConnection } from "./lib/useHub";
import { useLink } from "./lib/linkState";
import { useUi } from "./lib/store";
import Header from "./ui/Header";
import StageUI from "./ui/StageUI";
import FocusCard from "./ui/FocusCard";
import NodeTags from "./ui/NodeTags";

const Scene = lazy(() => import("./scene/Scene"));

export default function App() {
  useHubConnection();
  const link = useLink();
  const view = useUi((s) => s.view);

  // the page accent follows the link state; CSS animates the colour change
  useEffect(() => {
    document.documentElement.dataset.state =
      link.kind === "radio" ? "radio" : link.kind === "alert" || link.kind === "silent" ? "alert" : "wifi";
  }, [link.kind]);

  return (
    <>
      <Suspense fallback={null}><Scene /></Suspense>
      <NodeTags />
      <div className="grain" />
      <Header />
      <AnimatePresence mode="wait">
        {view === "stage" && (
          <motion.div key="stage" exit={{ opacity: 0, filter: "blur(10px)" }} transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}>
            <StageUI />
          </motion.div>
        )}
      </AnimatePresence>
      <FocusCard />
    </>
  );
}
