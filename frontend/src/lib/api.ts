// Thin wrappers over the hub's REST endpoints (server/app.py). In demo mode they are simulated by the caller.
import type { Diag } from "./types";

const post = (url: string, body?: unknown) =>
  fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) })
    .then((r) => r.json());

export const setRecording = (label: Diag | null) => post("/api/record", { label });
export const reloadModel = () => post("/api/model/reload");
export const sendCommand = (cmd: "radio" | "wifi") => post(`/api/cmd/${cmd}`);
