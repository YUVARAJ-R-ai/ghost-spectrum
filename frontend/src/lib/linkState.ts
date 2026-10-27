import { useHub } from "./store";
import { COLOR } from "./format";

export type LinkKind = "waiting" | "silent" | "wifi" | "radio" | "alert";

export interface LinkView {
  kind: LinkKind;
  label: string;       // the huge words on screen
  why: string;
  color: string;
  handover: boolean;   // radio carrying while Wi-Fi still alive: make-before-break
}

const WHY: Record<string, string> = {
  agent: "The agent switched early because Wi-Fi was about to fail",
  "wifi lost": "Wi-Fi dropped, so the node switched by reflex",
  "no reply": "Wi-Fi stopped answering, so the node switched by reflex",
};

/** One place that decides what the link is doing, shared by the headline, the scene and the page accent. */
export function deriveLink(s: ReturnType<typeof useHub.getState>["snap"]): LinkView {
  if (!s) return { kind: "waiting", label: "Waiting", why: "Connecting to the hub", color: COLOR.wifi, handover: false };
  if (!s.node.online) {
    return s.total
      ? { kind: "silent", label: "Node silent", why: "No packets on Wi-Fi or radio for 3 seconds", color: COLOR.bad, handover: false }
      : { kind: "waiting", label: "Waiting for Node A", why: "Power it on and join the hotspot", color: COLOR.wifi, handover: false };
  }
  if (s.node.mode === "radio") {
    return {
      kind: s.alert === "auth" ? "alert" : "radio", label: "433 MHz radio",
      why: WHY[s.node.why ?? ""] ?? s.node.why ?? "Carrying on the backup link",
      color: s.alert === "auth" ? COLOR.bad : COLOR.radio,
      handover: s.wifi_age !== null && s.wifi_age < 1.5,
    };
  }
  return {
    kind: "wifi", label: "Wi-Fi",
    why: s.node.why === "recovered" ? "Back on Wi-Fi: the node rejoined by itself" : "Primary link healthy",
    color: COLOR.wifi, handover: false,
  };
}

export const useLink = () => deriveLink(useHub((s) => s.snap));
