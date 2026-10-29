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

export const getStatus = () => fetch("/api/status").then((r) => r.json());

