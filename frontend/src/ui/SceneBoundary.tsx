import { Component, type ReactNode } from "react";

/** If WebGL is missing or the 3D crashes, the dashboard keeps working: panels, views and data are plain DOM. */
export default class SceneBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.warn("3D scene unavailable:", err); }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="fixed inset-0 z-0 grid place-items-center" style={{ background: "radial-gradient(60% 50% at 50% 40%, var(--accent-soft), transparent)" }}>
        <p className="max-w-[30ch] px-6 text-center text-[13px] leading-relaxed" style={{ color: "var(--faint)" }}>
          The 3D stage needs WebGL, which this browser can't start. Everything else still works.
        </p>
      </div>
    );
  }
}
