import { useEffect, useRef } from "react";
import { useUi } from "../lib/store";
import { TAGS, tagScreen } from "../scene/tags";
import { S } from "../scene/world";

// each label appears just after its node pops into the scene
const APPEAR: Record<string, number> = { hotspot: 1.0, A: 1.4, gateway: 1.6, laptop: 1.8, air: 2.2 };

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
      const headerClear = window.innerWidth < 768 ? 76 : 0;  // keep tags out from under the mobile header
      for (const t of TAGS) {
        const el = refs.current[t.id], s = tagScreen[t.id];
        if (!el || !s) continue;
        // keep labels clear of the floating nav pill at the top
        const y = Math.max(s.y, window.innerWidth >= 768 ? 118 : 0);
        el.style.transform = `translate3d(${s.x.toFixed(1)}px, ${y.toFixed(1)}px, 0) translate(-50%, -100%)`;
        const seen = S.intro > (APPEAR[t.id] ?? 1.5);
        el.style.opacity = seen && s.v && s.y > headerClear ? "" : "0";
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
