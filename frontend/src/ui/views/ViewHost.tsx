import { AnimatePresence } from "framer-motion";
import { useUi } from "../../lib/store";
import Timeline from "./Timeline";
import Diagnosis from "./Diagnosis";
import Incidents from "./Incidents";
import Teach from "./Teach";

/** Mounts whichever secondary view is open over the dimmed 3D scene. */
export default function ViewHost() {
  const view = useUi((s) => s.view);
  return (
    <AnimatePresence mode="wait">
      {view === "timeline" && <Timeline key="timeline" />}
      {view === "diagnosis" && <Diagnosis key="diagnosis" />}
      {view === "incidents" && <Incidents key="incidents" />}
      {view === "teach" && <Teach key="teach" />}
    </AnimatePresence>
  );
}
