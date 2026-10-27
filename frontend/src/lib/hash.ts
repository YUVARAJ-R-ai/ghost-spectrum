import type { Report } from "./types";

// The hub seals a report with sha256(json.dumps(report_without_hash, sort_keys=True)).
// To re-check that seal in the browser we have to reproduce Python's exact text:
// sorted keys, ", " and ": " separators, and floats that keep their ".0".
const FLOAT_KEYS = new Set(["duration_s", "peak_confidence"]);

function num(key: string, v: number): string {
  return FLOAT_KEYS.has(key) && Number.isInteger(v) ? `${v}.0` : String(v);
}

function pyJson(key: string, v: unknown): string {
  if (typeof v === "number") return num(key, v);
  if (typeof v === "string") return JSON.stringify(v).replace(/[\u0080-￿]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  if (Array.isArray(v)) return "[" + v.map((x) => pyJson(key, x)).join(", ") + "]";
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return "{" + Object.keys(o).sort().map((k) => `${JSON.stringify(k)}: ${pyJson(k, o[k])}`).join(", ") + "}";
  }
  return JSON.stringify(v);
}

export async function sealOf(report: Omit<Report, "sha256">): Promise<string | null> {
  if (!globalThis.crypto?.subtle) return null; // plain http on a LAN address has no SubtleCrypto
  const bytes = new TextEncoder().encode(pyJson("", report));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export type Seal = "ok" | "bad" | "unavailable";
export async function verify(report: Report): Promise<Seal> {
  const { sha256, ...rest } = report;
  const got = await sealOf(rest);
  return got === null ? "unavailable" : got === sha256 ? "ok" : "bad";
}
