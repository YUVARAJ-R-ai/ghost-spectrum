import { useHub } from "./store";
import { COLOR } from "./format";

import type { NetworkState } from "./types";

export type LinkKind = "waiting" | "silent" | "wifi" | "radio" | "alert";

export interface LinkView {
  kind: LinkKind;
  label: string;       // the huge words on screen
  why: string;
  color: string;
  handover: boolean;   // radio carrying while Wi-Fi still alive: make-before-break
  state: NetworkState;
}

const WHY: Record<string, string> = {
  agent: "The agent switched early because Wi-Fi was about to fail",
  "wifi lost": "Wi-Fi dropped, so the node switched by reflex",
  "no reply": "Wi-Fi stopped answering, so the node switched by reflex",
  MANUAL_BUTTON: "Manual override: physical button pressed on Node A",
  WIFI_LOST: "Wi-Fi dropped: autonomic reflex switched to 433 MHz radio",
  ACK_TIMEOUT: "Wi-Fi unacknowledged: reflex switched to 433 MHz radio",
  REMOTE_COMMAND: "Switched via laptop remote command",
  RECOVERED: "Wi-Fi link recovered: telemetry restored",
};

/** One place that decides what the link is doing, shared by the headline, the scene and the page accent. */
export function deriveLink(s: ReturnType<typeof useHub.getState>["snap"]): LinkView {
  if (!s) return { kind: "waiting", label: "Waiting", why: "Connecting to the hub", color: COLOR.wifi, handover: false, state: "BOOT" };
  
  const state: NetworkState = s.state ?? (
    !s.node.online ? (s.total ? "DEGRADED_OFFLINE" : "BOOT") :
    s.node.mode === "radio" ? "RADIO_ACTIVE" :
    (s.features.loss_mean && s.features.loss_mean > 15) ? "WIFI_DEGRADED" : "WIFI_ACTIVE"
  );

  if (state === "BOOT" || state === "WIFI_CONNECTING") {
    return {
      kind: "waiting",
      label: state === "BOOT" ? "System Boot" : "Connecting",
      why: s.total ? "Re-establishing connection to Wi-Fi" : "Waiting for Node A to join network",
      color: COLOR.wifi,
      handover: false,
      state
    };
  }

  if (state === "DEGRADED_OFFLINE" || !s.node.online) {
    return {
      kind: "silent",
      label: "Link Offline",
      why: "No packets received on Wi-Fi or radio for > 3.0s",
      color: COLOR.bad,
      handover: false,
      state: "DEGRADED_OFFLINE"
    };
  }

  if (state === "RADIO_ACTIVE" || s.node.mode === "radio") {
    const reasonKey = s.node.reason || s.node.why || "";
    return {
      kind: s.alert === "auth" ? "alert" : "radio",
      label: "433 MHz Radio",
      why: WHY[reasonKey] ?? WHY[s.node.why ?? ""] ?? "Telemetry forwarded via Node B 433 MHz gateway",
      color: s.alert === "auth" ? COLOR.bad : COLOR.radio,
      handover: s.wifi_age !== null && s.wifi_age < 2.0,
      state: "RADIO_ACTIVE"
    };
  }

  if (state === "RECOVERY_PENDING" || state === "RECOVERY_PROBATION") {
    return {
      kind: "wifi",
      label: "Wi-Fi Probation",
      why: state === "RECOVERY_PENDING" ? "Wi-Fi reconnected, verifying link stability..." : "Wi-Fi link under probation before full handover",
      color: COLOR.wifi,
      handover: true,
      state
    };
  }

  if (state === "WIFI_DEGRADED") {
    return {
      kind: "wifi",
      label: "Wi-Fi Degraded",
      why: `High packet loss (${Math.round(s.features.loss_mean ?? s.node.loss ?? 0)}%) or ping (${Math.round(s.features.rtt_mean ?? s.node.rtt ?? 0)}ms)`,
      color: COLOR.warn,
      handover: false,
      state: "WIFI_DEGRADED"
    };
  }

  return {
    kind: "wifi",
    label: "Wi-Fi Active",
    why: s.node.why === "recovered" || s.node.reason === "RECOVERED" ? "Back on Wi-Fi: node recovered and verified" : "Primary Wi-Fi link nominal (UDP port 4210)",
    color: COLOR.wifi,
    handover: false,
    state: "WIFI_ACTIVE"
  };
}


export const useLink = () => deriveLink(useHub((s) => s.snap));
