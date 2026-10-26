// Shapes of the hub's 5 Hz websocket snapshot (server/app.py Hub.snapshot).
export type Diag = "nominal" | "fading" | "congestion" | "ap_down" | "auth_fail";
export const DIAGS: Diag[] = ["nominal", "fading", "congestion", "ap_down", "auth_fail"];

export type PathName = "wifi" | "radio" | "wifi+radio" | "radio+wifi";

export interface Features {
  rssi_now: number; rssi_mean: number; rssi_min: number; rssi_slope: number;
  rtt_mean: number; rtt_max: number; loss_now: number; loss_mean: number;
  connected_frac: number; reason_auth: number; reason_no_ap: number; reason_other: number;
}

export interface AgentEntry { t: number; saw: string; think: string; did: string }

export interface Report {
  incident_id: string; started_iso: string; duration_s: number; diagnoses: string[];
  peak_confidence: number; agent_actions: string[]; readings_carried_by_radio: number;
  readings_lost: number; sha256: string;
}

export interface Snapshot {
  now: number;
  node: { online: boolean; mode?: "wifi" | "radio" | null; why?: string | null; path?: string | null; reason: string };
  wifi_age: number | null;
  radio_age: number | null;
  gateway: { online: boolean; relay?: number; ok?: number; bad?: number };
  sentinel: { online: boolean; port?: string | null };
  air: { ch?: number; frames_per_s?: number; deauth_per_s?: number };
  readings: [number, number, number, string][];   // seq, t, sensor, paths
  lost: number;
  total: number;
  features: Partial<Features>;
  probs: Record<Diag, number>;
  held: Diag;
  model: { source: "rules" | "model"; detail: string; accuracy?: number; samples?: number; importances?: [string, number][] };
  agent: AgentEntry[];
  alert: "auth" | "deauth" | null;
  incident: { start: number; diagnoses: string[]; actions: string[]; peak_conf: number } | null;
  reports: Report[];
  recording: { label: Diag | null; rows: number };
}

export type Source = "live" | "demo";
