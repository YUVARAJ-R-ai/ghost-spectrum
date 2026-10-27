import * as THREE from "three";
import { COLOR } from "../lib/format";

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// Where everything stands on the stage (x right, y up, z toward the camera)
export const POS = {
  A: v(-4.5, 0, 0.9),
  hotspot: v(0, 0, -3.3),
  laptop: v(4.5, 0, 0.7),
  gateway: v(2.3, 0, 3.1),
  air: v(-3.7, 0, -3.7),
};

// Route 1: Node A -> the router (phone) -> the laptop, over Wi-Fi
export const wifiCurve = new THREE.CatmullRomCurve3([
  v(-3.95, 0.9, 0.75), v(-2.4, 2.4, -1.0), v(0, 1.85, -3.05), v(2.4, 2.4, -0.8), v(4.0, 1.3, 0.4),
], false, "catmullrom", 0.5);

// Route 2: Node A -> 433 MHz radio -> the gateway (Node B) -> USB -> the laptop
export const radioCurve = new THREE.CatmullRomCurve3([
  v(-3.9, 0.55, 1.3), v(-1.5, 1.3, 2.9), v(2.35, 1.0, 2.9), v(3.6, 0.55, 2.0), v(4.0, 0.25, 1.3),
], false, "catmullrom", 0.5);

const SAMPLES = 240;
export const wifiPts = wifiCurve.getSpacedPoints(SAMPLES);
export const radioPts = radioCurve.getSpacedPoints(SAMPLES);

/** Point at fraction u (0..1) of an evenly spaced sample table: far cheaper than curve.getPointAt per particle. */
export function pointAt(table: THREE.Vector3[], u: number, out: THREE.Vector3) {
  const f = Math.min(Math.max(u, 0), 1) * SAMPLES;
  const i = Math.min(Math.floor(f), SAMPLES - 1);
  return out.lerpVectors(table[i], table[i + 1], f - i);
}

// where along the radio route the wireless hop ends and the USB cable begins (at the gateway)
export const RADIO_SPLIT = (() => {
  let best = 0, d = 1e9;
  radioPts.forEach((p, i) => { const k = p.distanceTo(v(2.35, 1.0, 2.9)); if (k < d) { d = k; best = i; } });
  return best / SAMPLES;
})();

/**
 * Smoothed, scene-wide state. A driver component eases these toward the live snapshot every frame and
 * every mesh reads them in its own useFrame, so the 3D never re-renders React.
 */
export const S = {
  online: 0,        // node heard recently
  strength: 0,      // Wi-Fi signal quality 0..1
  wifiUp: 0,        // Wi-Fi link usable 0..1
  radio: 0,         // radio carrying the data 0..1
  handover: 0,      // radio carrying while Wi-Fi is still alive
  auth: 0,          // password rejected
  deauth: 0,        // attack on the air
  congest: 0,       // Wi-Fi choked
  lostFlash: 0,     // spikes when a reading is lost
  relay: 0,         // relay clicked on
  sensor: 0.5,      // latest IR reading 0..1
  hasData: 0,
  gw: 0,            // gateway (Node B) connected over USB
  airOn: 0,         // air watcher (Node C) connected
  accent: new THREE.Color(COLOR.wifi),
  intro: 0,         // seconds since mount, for the entrance choreography
  hover: "" as string,
};

export const easeOutBack = (t: number) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
/** 0..1 entrance progress for something that starts `delay` seconds after mount and takes `dur` seconds. */
export const introAt = (delay: number, dur = 0.9) => Math.min(1, Math.max(0, (S.intro - delay) / dur));

/** All five nodes are drawn a little oversized so they read clearly from the camera. */
export const NODE_SCALE = 1.18;
