import { Suspense, lazy, useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useHubConnection } from "./lib/useHub";
import { useLink } from "./lib/linkState";
import { useUi, type View } from "./lib/store";
import Header from "./ui/Header";
import StageUI from "./ui/StageUI";
import FocusCard from "./ui/FocusCard";
import NodeTags from "./ui/NodeTags";
import AlertBanner from "./ui/AlertBanner";
import ViewHost from "./ui/views/ViewHost";
import SceneBoundary from "./ui/SceneBoundary";

const Scene = lazy(() => import("./scene/Scene"));

export default function App() {
  useHubConnection();
  const link = useLink();
  const view = useUi((s) => s.view);
  const quality = useUi((s) => s.quality);
  useEffect(() => { document.documentElement.dataset.quality = quality; }, [quality]);
  const setView = useUi((s) => s.setView);

  // deep links (#timeline) and keyboard: 1-5 switch views, Esc closes the node card
  useEffect(() => {
    const order: View[] = ["stage", "timeline", "diagnosis", "incidents", "teach"];
    const fromHash = () => { const h = location.hash.slice(1) as View; if (order.includes(h)) setView(h); };
    fromHash();
    const key = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.tagName === "INPUT") return;
      const i = Number(e.key);
      if (i >= 1 && i <= 5) setView(order[i - 1]);
      if (e.key === "Escape") useUi.getState().setFocus(null);
    };
    window.addEventListener("hashchange", fromHash); window.addEventListener("keydown", key);
    return () => { window.removeEventListener("hashchange", fromHash); window.removeEventListener("keydown", key); };
  }, [setView]);
  useEffect(() => { history.replaceState(null, "", view === "stage" ? location.pathname + location.search : `#${view}`); }, [view]);

  // the page accent follows the link state; CSS animates the colour change
  useEffect(() => {
    document.documentElement.dataset.state =
      link.kind === "radio" ? "radio" : link.kind === "alert" || link.kind === "silent" ? "alert" : "wifi";
  }, [link.kind]);

  return (
    <>
      <SceneBoundary><Suspense fallback={null}><Scene /></Suspense></SceneBoundary>
      <NodeTags />
      <div className="grain" />
      <Header />
      <AlertBanner />
      <AnimatePresence mode="wait">
        {view === "stage" && (
          <motion.div key="stage" exit={{ opacity: 0 }} transition={{ duration: 0.4, ease: [0.32, 0.72, 0, 1] }}>
            <StageUI />
          </motion.div>
        )}
      </AnimatePresence>
      <ViewHost />
      <FocusCard />
    </>
  );
}
