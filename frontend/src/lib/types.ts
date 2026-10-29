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

export type NetworkState =
  | "BOOT"
  | "WIFI_CONNECTING"
  | "WIFI_ACTIVE"
  | "WIFI_DEGRADED"
  | "RADIO_ACTIVE"
  | "RECOVERY_PENDING"
  | "RECOVERY_PROBATION"
  | "DEGRADED_OFFLINE";

export type ActiveSource = "NODE_A_WIFI" | "NODE_B_RADIO" | "NONE" | "SIMULATED";

export type CmdStatus = "sent" | "ack" | "timeout" | "unreachable";

export interface CmdState {
  id: number;
  cmd: string;
  sent_at: number;
  status: CmdStatus;
  detail?: string;
  ack_at?: number;
  rtt_ms?: number;
}

export interface HubEvent {
  t: number;
  type: string;
  msg: string;
  source: string;
}

export interface Snapshot {
  now: number;
  state?: NetworkState;
  source_type?: "HARDWARE" | "SIMULATED";
  active_source?: ActiveSource;
  node: {
    online: boolean;
    mode?: "wifi" | "radio" | null;
    why?: string | null;
    path?: string | null;
    reason: string;
    seq?: number;
    sensor?: number;
    rssi?: number;
    rtt?: number;
    loss?: number;
    ch?: number;
  };
  wifi_age: number | null;
  radio_age: number | null;
  gateway: {
    online: boolean;
    relay?: number;
    ok?: number;
    bad?: number;
    dup?: number;
    last?: number;
    health?: number;
    alert?: string;
    ip?: string;
  };
  sentinel: {
    online: boolean;
    port?: string | null;
    fault?: number;
    anomaly?: string;
    rssi?: number;
    ch?: number;
    ip?: string;
  };
  air: { ch?: number; frames_per_s?: number; deauth_per_s?: number };
  readings: [number, number, number, string][];   // seq, t, sensor, paths
  lost: number;
  total: number;
  wifi_count?: number;
  radio_count?: number;
  cmd_state?: CmdState | null;
  events?: HubEvent[];
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

