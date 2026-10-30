import { useHub } from "./store";
import { sim } from "./sim";
import type { Diag } from "./types";

const post = (url: string, body?: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
    .then((r) => r.json());

export const setRecording = (label: Diag | null) => post("/api/record", { label });
export const reloadModel = () => post("/api/model/reload");

export const sendCommand = (cmd: "radio" | "wifi") => {
  if (useHub.getState().source === "demo") {
    return sim.execCommand(cmd);
  }
  return post(`/api/cmd/${cmd}`);
};

export const sendRateCommand = (ms: number) => {
  if (useHub.getState().source === "demo") {
    return sim.execCommand("rate", { ms });
  }
  return post("/api/cmd/rate", { ms });
};

export const triggerClusterAlert = () => {
  if (useHub.getState().source === "demo") {
    return sim.execCommand("trigger_alert");
  }
  return post("/api/cmd/trigger_alert");
};

export const clearClusterAlert = () => {
  if (useHub.getState().source === "demo") {
    return sim.execCommand("clear_alert");
  }
  return post("/api/cmd/clear_alert");
};

export const testSupervisorBuzzer = () => {
  if (useHub.getState().source === "demo") {
    return sim.execCommand("test_buzzer");
  }
  return post("/api/cmd/test_buzzer");
};

export const zeroSensor = () => {
  if (useHub.getState().source === "demo") {
    return sim.execCommand("zero_sensor");
  }
  return post("/api/cmd/zero_sensor");
};

export const sendChatCommand = async (text: string, engine: "auto" | "bedrock" | "jev" = "auto") => {
  if (useHub.getState().source === "demo") {
    const raw = text.toLowerCase();
    if (raw.includes("jam") || raw.includes("deauth")) {
      await sim.execCommand("trigger_alert");
      return { reply: "⚡ [JEV Demo] Simulated jamming anomaly activated on channel 11.", action: "JAMMING", status: "ok", engine: "jev" };
    }
    if (raw.includes("clear") || raw.includes("re-arm")) {
      await sim.execCommand("clear_alert");
      return { reply: "⚡ [JEV Demo] All simulated alerts reset to nominal.", action: "CLEAR", status: "ok", engine: "jev" };
    }
    if (raw.includes("buzzer") || raw.includes("alarm")) {
      await sim.execCommand("test_buzzer");
      return { reply: "⚡ [JEV Demo] Supervisor buzzer alert tested in simulation.", action: "BUZZER", status: "ok", engine: "jev" };
    }
    return { reply: `⚡ [JEV Demo] Local agent executed: "${text}"`, action: "LOG", status: "ok", engine: "jev" };
  }
  return post("/api/chat/command", { text, engine });
};

export const getStatus = () => fetch("/api/status").then((r) => r.json());

