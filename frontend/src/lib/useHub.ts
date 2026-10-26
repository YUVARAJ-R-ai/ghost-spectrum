import { useEffect } from "react";
import { useHub } from "./store";
import { sim, useDemo } from "./sim";
import type { Snapshot } from "./types";

/**
 * Chooses where snapshots come from. The real hub's websocket wins whenever it connects; if there
 * is none (or the user pins Demo) the in-browser simulator runs instead. Switching is seamless:
 * the store is reset so charts don't mix two timelines.
 */
export function useHubConnection() {
  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let dead = false;
    let everOpened = false;
    const st = useHub.getState;

    const goDemo = () => {
      if (st().source === "demo" && st().snap) { sim.start(); return; }
      st().reset(); st().setSource("demo"); sim.restartStory(); useDemo.getState().playStory(); sim.start();
    };
    const goLive = () => {
      sim.stop();
      if (st().source !== "live") { st().reset(); st().setSource("live"); }
    };

    const open = () => {
      if (dead) return;
      const proto = location.protocol === "https:" ? "wss" : "ws";
      try { ws = new WebSocket(`${proto}://${location.host}/ws`); } catch { return fallback(); }
      ws.onopen = () => { everOpened = true; wait = 2000; st().setWsOpen(true); if (!st().pinnedDemo) goLive(); };
      ws.onmessage = (e) => {
        if (st().pinnedDemo) return;
        try { st().apply(JSON.parse(e.data) as Snapshot, "live"); } catch { /* ignore a bad frame */ }
      };
      ws.onclose = () => { st().setWsOpen(false); fallback(); schedule(); };
      ws.onerror = () => ws?.close();
    };
    // probe for a hub in the background, backing off so a missing hub does not spam the console
    let wait = 2000;
    const schedule = () => { if (!dead) { retry = setTimeout(open, wait); wait = Math.min(wait * 1.6, 30000); } };
    const fallback = () => { if (!st().pinnedDemo) goDemo(); };

    // static hosting (no hub at all) or a dead hub: start the simulator straight away, then keep
    // probing in the background and take over if a hub shows up
    if (location.protocol === "file:" || import.meta.env.MODE === "static") goDemo();
    else {
      const guard = setTimeout(() => { if (!st().wsOpen) fallback(); }, 900);
      open();
      void guard;
    }

    // user toggled the source in the header
    const unsub = useHub.subscribe((s, prev) => {
      if (s.pinnedDemo === prev.pinnedDemo) return;
      if (s.pinnedDemo) goDemo();
      else if (s.wsOpen) goLive();
      else goDemo();
    });
    return () => { dead = true; clearTimeout(retry); ws?.close(); sim.stop(); unsub(); };
  }, []);
}
