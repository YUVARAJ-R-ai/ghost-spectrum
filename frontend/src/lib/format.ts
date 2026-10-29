import type { Diag } from "./types";

export const DIAG_NAME: Record<Diag, string> = {
  nominal: "Healthy", fading: "Signal fading", congestion: "Congested",
  ap_down: "Router gone", auth_fail: "Password rejected",
};

// One-line plain-English meaning, shown under the diagnosis
export const DIAG_GIST: Record<Diag, string> = {
  nominal: "The link is strong. Every reading is confirmed.",
  fading: "Signal is sliding toward the drop zone. Moving to radio before it breaks.",
  congestion: "Wi-Fi is up but choked. Slowing the stream; radio catches drops.",
  ap_down: "The router vanished. Radio carries everything until it returns.",
  auth_fail: "The router refuses the password. Retrying can never fix this.",
};

// Hex colours shared between the DOM and the WebGL scene
export const COLOR = {
  wifi: "#6cb8ff", radio: "#ffb347", both: "#4be3c1", bad: "#ff5c6c", good: "#52e08f",
  warn: "#ff8a4c", violet: "#a98bff", ink: "#050507",
} as const;

export const DIAG_COLOR: Record<Diag, string> = {
  nominal: COLOR.good, fading: COLOR.radio, congestion: "#ff8a4c", ap_down: COLOR.bad, auth_fail: "#ff4d8d",
};

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
// frame-rate independent exponential smoothing
export const damp = (a: number, b: number, lambda: number, dt: number) => lerp(a, b, 1 - Math.exp(-lambda * dt));

/** 0 (dead) .. 1 (perfect): how healthy the Wi-Fi signal looks, from RSSI alone. */
export const signalStrength = (rssi: number | undefined) =>
  rssi === undefined ? 0 : clamp((rssi + 95) / 50, 0, 1);

export const timeShort = (t: number) => new Date(t * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
