import { useEffect, useRef } from "react";
import { useUi } from "../lib/store";
import { TAGS, tagScreen } from "../scene/tags";

/** Name labels pinned to the 3D nodes. Positions come from the scene every frame; click opens the node's detail card. */
export default function NodeTags() {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const dots = useRef<Record<string, HTMLElement | null>>({});
  const setFocus = useUi((s) => s.setFocus);
  const view = useUi((s) => s.view);

  useEffect(() => {
    let id = 0, n = 0;
    const loop = () => {
      n++;
      for (const t of TAGS) {
        const el = refs.current[t.id], s = tagScreen[t.id];
        if (!el || !s) continue;
        el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
        el.style.opacity = s.v ? "" : "0";
        const d = dots.current[t.id];
        if (d && n % 8 === 0) { const c = t.dot(); d.style.background = c; d.style.boxShadow = `0 0 10px ${c}`; }
      }
      id = requestAnimationFrame(loop);
    };
    id = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div className="pointer-events-none fixed inset-0 z-[5] overflow-hidden transition-opacity duration-700" style={{ opacity: view === "stage" ? 1 : 0, visibility: view === "stage" ? "visible" : "hidden" }}>
      {TAGS.map((t) => (
        <button key={t.id} ref={(el) => { refs.current[t.id] = el; }} className="node-tag absolute left-0 top-0" onClick={() => setFocus(t.id)}>
          <i ref={(el) => { dots.current[t.id] = el; }} />
          <span><b>{t.title}</b><em>{t.sub}</em></span>
        </button>
      ))}
    </div>
  );
}
