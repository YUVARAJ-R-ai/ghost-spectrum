import { create } from "zustand";
import type { Diag, Snapshot, Source } from "./types";

export type PathKind = "wifi" | "radio" | "both";
export interface SceneEvent { kind: "reading" | "lost"; path?: PathKind; seq?: number; at: number }
export interface SensorPt { seq: number; t: number; v: number; path: PathKind }
export interface HistPt { t: number; rssi: number; rtt: number; loss: number }
export interface Band { start: number; end: number | null; diag: Diag }

// Readings and losses are one-shot events for the 3D scene: it drains this queue every frame
// instead of re-rendering React 5 times a second.
export const eventQueue: SceneEvent[] = [];

const pathKind = (p: string): PathKind => (p === "wifi" ? "wifi" : p === "radio" ? "radio" : "both");
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

interface HubState {
  source: Source;
  pinnedDemo: boolean;
  wsOpen: boolean;
  snap: Snapshot | null;
  sensors: SensorPt[];
  hist: HistPt[];
  bands: Band[];
  lostMarks: number[];
  snapAt: number;
  setSource: (s: Source) => void;
  setPinnedDemo: (v: boolean) => void;
  setWsOpen: (v: boolean) => void;
  apply: (s: Snapshot, from: Source) => void;
  reset: () => void;
}

const seen = new Set<number>();
let lastLost = 0;
let lastHeld: Diag = "nominal";

export const useHub = create<HubState>((set, get) => ({
  source: "demo",
  pinnedDemo: false,
  wsOpen: false,
  snap: null,
  sensors: [],
  hist: [],
  bands: [],
  lostMarks: [],
  snapAt: 0,
  setSource: (source) => set({ source }),
  setPinnedDemo: (pinnedDemo) => set({ pinnedDemo }),
  setWsOpen: (wsOpen) => set({ wsOpen }),
  reset: () => {
    seen.clear(); lastLost = 0; lastHeld = "nominal"; eventQueue.length = 0;
    set({ snap: null, sensors: [], hist: [], bands: [], lostMarks: [] });
  },
  apply: (s, from) => {
    const prev = get();
    if (from !== prev.source) return; // ignore a stale feed after switching source

    // keep object identity for slow-changing lists so panels don't re-render needlessly
    if (prev.snap) {
      if (same(prev.snap.agent, s.agent)) s.agent = prev.snap.agent;
      if (same(prev.snap.reports, s.reports)) s.reports = prev.snap.reports;
      if (same(prev.snap.model, s.model)) s.model = prev.snap.model;
    }

    // new readings -> particles in the scene and points on the timeline
    const sensors = prev.sensors;
    let grew = false;
    for (const [seq, t, v, p] of s.readings) {
      if (seen.has(seq)) continue;
      seen.add(seq);
      const path = pathKind(p);
      eventQueue.push({ kind: "reading", path, seq, at: performance.now() });
      sensors.push({ seq, t, v, path });
      grew = true;
    }
    if (eventQueue.length > 200) eventQueue.splice(0, eventQueue.length - 200);
    if (seen.size > 4000) seen.clear();
    if (s.lost > lastLost) for (let i = 0; i < Math.min(s.lost - lastLost, 6); i++) eventQueue.push({ kind: "lost", at: performance.now() });
    const lostMarks = prev.lostMarks;
    if (s.lost > lastLost) lostMarks.push(s.now);
    lastLost = s.lost;

    const cutoff = s.now - 300;
    while (sensors.length && sensors[0].t < cutoff) sensors.shift();
    const hist = prev.hist;
    const f = s.features;
    if (f.rssi_now !== undefined && (!hist.length || s.now - hist[hist.length - 1].t >= 0.45)) {
      hist.push({ t: s.now, rssi: f.rssi_now, rtt: f.rtt_mean ?? 0, loss: f.loss_mean ?? 0 });
    }
    while (hist.length && hist[0].t < cutoff) hist.shift();

    // diagnosis timeline bands (what was wrong, and when)
    const bands = prev.bands;
    if (s.held !== lastHeld) {
      const open = bands[bands.length - 1];
      if (open && open.end === null) open.end = s.now;
      if (s.held !== "nominal") bands.push({ start: s.now, end: null, diag: s.held });
      lastHeld = s.held;
    }
    while (bands.length && (bands[0].end ?? s.now) < cutoff) bands.shift();

    while (lostMarks.length && lostMarks[0] < cutoff) lostMarks.shift();
    set({ snap: s, sensors: grew ? [...sensors] : sensors, hist: [...hist], bands: [...bands], lostMarks: [...lostMarks], snapAt: performance.now() });
  },
}));

// ---- UI state (which view, which node is focused, quality) ----
export type View = "stage" | "timeline" | "diagnosis" | "incidents" | "teach";
export type NodeId = "A" | "hotspot" | "laptop" | "gateway" | "air";
interface UiState {
  view: View;
  focus: NodeId | null;
  quality: "high" | "low";
  autoRotate: boolean;
  setView: (v: View) => void;
  setFocus: (n: NodeId | null) => void;
  setQuality: (q: "high" | "low") => void;
  setAutoRotate: (v: boolean) => void;
}
export const useUi = create<UiState>((set) => ({
  view: "stage", focus: null, quality: "high", autoRotate: true,
  setView: (view) => set({ view, focus: null }),
  setFocus: (focus) => set({ focus }),
  setQuality: (quality) => set({ quality }),
  setAutoRotate: (autoRotate) => set({ autoRotate }),
}));
