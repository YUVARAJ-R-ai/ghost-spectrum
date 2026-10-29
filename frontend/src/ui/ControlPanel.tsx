import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Broadcast,
  WifiHigh,
  Clock,
  ArrowCounterClockwise,
  Pause,
  Play,
  CheckCircle,
  Warning,
  Lightning,
  Bell,
  ShieldCheck,
  Target,
} from "@phosphor-icons/react";
import { useHub } from "../lib/store";
import {
  sendCommand,
  sendRateCommand,
  triggerClusterAlert,
  clearClusterAlert,
  testSupervisorBuzzer,
  zeroSensor,
} from "../lib/api";
import { useDemo } from "../lib/sim";
import { Bezel } from "./kit";

const RATES = [
  { ms: 250, label: "250ms" },
  { ms: 500, label: "500ms" },
  { ms: 1000, label: "1s" },
  { ms: 2000, label: "2s" },
];

export default function ControlPanel() {
  const snap = useHub((s) => s.snap);
  const source = useHub((s) => s.source);
  const { paused, setPaused, resetScenario } = useDemo();

  const [busyCmd, setBusyCmd] = useState<string | null>(null);
  const [selectedRate, setSelectedRate] = useState<number>(500);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: "ok" | "warn" | "bad" } | null>(null);

  const state = snap?.state ?? "BOOT";
  const isWifiActive = state === "WIFI_ACTIVE" || state === "WIFI_DEGRADED";
  const isRadioActive = state === "RADIO_ACTIVE";
  const isWifiDown = state === "DEGRADED_OFFLINE" || !snap?.node.online;

  const showMsg = (text: string, type: "ok" | "warn" | "bad" = "ok") => {
    setStatusMsg({ text, type });
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleClusterAction = async (action: "jam" | "alarm" | "clear" | "zero") => {
    setBusyCmd(action);
    try {
      if (action === "jam") {
        await triggerClusterAlert();
        showMsg("⚡ Jamming attack injected: Node 3 Sentinel active", "bad");
      } else if (action === "alarm") {
        await testSupervisorBuzzer();
        showMsg("🔔 Supervisor buzzer test dispatched to Node 2", "warn");
      } else if (action === "clear") {
        await clearClusterAlert();
        showMsg("🟢 All cluster alerts cleared — network nominal", "ok");
      } else if (action === "zero") {
        await zeroSensor();
        showMsg("🎯 Optical baseline calibrated", "ok");
      }
    } catch {
      showMsg("Failed to dispatch cluster action", "bad");
    } finally {
      setTimeout(() => setBusyCmd(null), 800);
    }
  };

  const handleCommand = async (cmd: "radio" | "wifi") => {
    setBusyCmd(cmd);
    try {
      const res = await sendCommand(cmd);
      if (res?.status === "unreachable") {
        showMsg(res.detail ?? "Device unreachable over Wi-Fi", "bad");
      } else {
        showMsg(`Command '${cmd}' acknowledged`, "ok");
      }
    } catch {
      showMsg("Failed to communicate with hub", "bad");
    } finally {
      setTimeout(() => setBusyCmd(null), 1200);
    }
  };

  const handleRate = async (ms: number) => {
    setSelectedRate(ms);
    try {
      await sendRateCommand(ms);
      showMsg(`Stream rate set to ${ms}ms`, "ok");
    } catch {
      // ignore
    }
  };

  // State badge styling
  const stateColor =
    snap?.alert
      ? "var(--bad)"
      : state === "WIFI_ACTIVE"
      ? "var(--good)"
      : state === "WIFI_DEGRADED"
      ? "var(--warn)"
      : state === "RADIO_ACTIVE"
      ? "var(--radio)"
      : state === "RECOVERY_PROBATION" || state === "RECOVERY_PENDING"
      ? "#4be3c1"
      : "var(--bad)";

  return (
    <Bezel tight>
      <div className="p-3.5 md:p-4">
        {/* Top Header: State and Active Transport */}
        <div className="flex items-center justify-between gap-2 border-b pb-2.5" style={{ borderColor: "var(--hair)" }}>
          <div className="flex items-center gap-2">
            <span
              className="mono rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wider uppercase"
              style={{
                background: `color-mix(in srgb, ${stateColor} 16%, transparent)`,
                color: stateColor,
                border: `1px solid color-mix(in srgb, ${stateColor} 30%, transparent)`,
              }}
            >
              {snap?.alert ? "CLUSTER THREAT ALERT" : state.replace("_", " ")}
            </span>
          </div>

          <div className="flex items-center gap-1.5 text-[11px]">
            <span
              className="mono rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                background: source === "live" ? "rgba(82,224,143,.15)" : "rgba(255,179,71,.15)",
                color: source === "live" ? "var(--good)" : "var(--radio)",
              }}
            >
              {source === "live" ? "LIVE HW" : "SIMULATED"}
            </span>
            <span className="mono text-[11px] opacity-70">
              {snap?.active_source ?? "NONE"}
            </span>
          </div>
        </div>

        {/* Live Cluster Action Dispatch Grid */}
        <div className="mt-3">
          <div className="label mb-2 flex items-center justify-between">
            <span>Cluster Direct Actions</span>
            <span className="mono text-[10px] text-[var(--muted)]">Real-time Triggers</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            {/* Simulate Jamming Anomaly */}
            <button
              onClick={() => handleClusterAction("jam")}
              disabled={busyCmd === "jam"}
              className="pill !w-full !justify-center !py-2 !text-[11.5px] font-semibold transition-all hover:border-[var(--bad)]"
              style={{
                color: "var(--bad)",
                background: "rgba(255,92,108,.08)",
                borderColor: "rgba(255,92,108,.3)",
              }}
              title="Inject simulated deauth attack via Node 3 Sentinel"
            >
              <Lightning size={14} weight="fill" className="mr-1.5 shrink-0" />
              {busyCmd === "jam" ? "Injecting..." : "Simulate Jamming"}
            </button>

            {/* Test Supervisor Buzzer */}
            <button
              onClick={() => handleClusterAction("alarm")}
              disabled={busyCmd === "alarm"}
              className="pill !w-full !justify-center !py-2 !text-[11.5px] font-semibold transition-all hover:border-[var(--warn)]"
              style={{
                color: "var(--warn)",
                background: "rgba(255,179,71,.08)",
                borderColor: "rgba(255,179,71,.3)",
              }}
              title="Trigger test alarm pulse on Node 2 Supervisor Buzzer"
            >
              <Bell size={14} weight="fill" className="mr-1.5 shrink-0" />
              {busyCmd === "alarm" ? "Pulsing..." : "Test Buzzer"}
            </button>

            {/* Clear Alerts / Re-Arm */}
            <button
              onClick={() => handleClusterAction("clear")}
              disabled={busyCmd === "clear"}
              className="pill !w-full !justify-center !py-2 !text-[11.5px] font-semibold transition-all hover:border-[var(--good)]"
              style={{
                color: "var(--good)",
                background: "rgba(82,224,143,.08)",
                borderColor: "rgba(82,224,143,.3)",
              }}
              title="Reset all alert flags and return cluster to nominal"
            >
              <ShieldCheck size={14} weight="fill" className="mr-1.5 shrink-0" />
              {busyCmd === "clear" ? "Clearing..." : "Re-Arm Cluster"}
            </button>

            {/* Calibrate Optical Baseline */}
            <button
              onClick={() => handleClusterAction("zero")}
              disabled={busyCmd === "zero"}
              className="pill !w-full !justify-center !py-2 !text-[11.5px] font-semibold transition-all hover:border-[var(--accent)]"
              style={{
                color: "var(--accent)",
                background: "rgba(100,200,255,.08)",
                borderColor: "rgba(100,200,255,.3)",
              }}
              title="Synchronize Node 1 optical sensor baseline"
            >
              <Target size={14} weight="fill" className="mr-1.5 shrink-0" />
              {busyCmd === "zero" ? "Syncing..." : "Calibrate Sensor"}
            </button>
          </div>
        </div>

        {/* Link Handover (Force Radio / Return Wi-Fi) */}
        <div className="mt-3 border-t pt-2.5" style={{ borderColor: "var(--hair)" }}>
          <div className="label mb-2 flex items-center justify-between">
            <span>Link Handover</span>
            <span className="mono text-[10px] opacity-60">Node 1 Transport</span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => handleCommand("radio")}
              disabled={busyCmd === "radio" || isRadioActive}
              className={`pill !w-full !justify-center !py-1.5 !text-[11px] font-medium transition-all ${
                isRadioActive ? "opacity-50 cursor-not-allowed" : "hover:border-[var(--radio)]"
              }`}
              style={{
                borderColor: isRadioActive ? "var(--radio)" : undefined,
                color: isRadioActive ? "var(--radio)" : "var(--ink)",
              }}
            >
              <Broadcast size={13} weight={isRadioActive ? "fill" : "regular"} className="mr-1.5" />
              {busyCmd === "radio" ? "Sending..." : isRadioActive ? "Radio Active" : "Force Radio"}
            </button>

            <button
              onClick={() => handleCommand("wifi")}
              disabled={busyCmd === "wifi" || isWifiActive}
              className={`pill !w-full !justify-center !py-1.5 !text-[11px] font-medium transition-all ${
                isWifiActive ? "opacity-50 cursor-not-allowed" : "hover:border-[var(--wifi)]"
              }`}
              style={{
                borderColor: isWifiActive ? "var(--wifi)" : undefined,
                color: isWifiActive ? "var(--wifi)" : "var(--ink)",
              }}
              title={isWifiDown ? "Cannot send command: Node 1 Wi-Fi is disconnected" : undefined}
            >
              <WifiHigh size={13} weight={isWifiActive ? "fill" : "regular"} className="mr-1.5" />
              {busyCmd === "wifi" ? "Probation..." : isWifiActive ? "Wi-Fi Active" : "Return Wi-Fi"}
            </button>
          </div>
        </div>

        {/* Action Status Toast Banner */}
        <AnimatePresence>
          {statusMsg && (
            <motion.div
              initial={{ opacity: 0, height: 0, marginTop: 0 }}
              animate={{ opacity: 1, height: "auto", marginTop: 8 }}
              exit={{ opacity: 0, height: 0, marginTop: 0 }}
              className="flex items-center gap-2 rounded-lg p-2 text-[11px] font-medium"
              style={{
                background:
                  statusMsg.type === "bad"
                    ? "rgba(255,92,108,.14)"
                    : statusMsg.type === "warn"
                    ? "rgba(255,179,71,.14)"
                    : "rgba(82,224,143,.14)",
                color:
                  statusMsg.type === "bad"
                    ? "var(--bad)"
                    : statusMsg.type === "warn"
                    ? "var(--warn)"
                    : "var(--good)",
                border: `1px solid ${
                  statusMsg.type === "bad"
                    ? "rgba(255,92,108,.3)"
                    : statusMsg.type === "warn"
                    ? "rgba(255,179,71,.3)"
                    : "rgba(82,224,143,.3)"
                }`,
              }}
            >
              {statusMsg.type === "bad" ? (
                <Warning size={14} weight="fill" className="shrink-0" />
              ) : (
                <CheckCircle size={14} weight="fill" className="shrink-0" />
              )}
              <span>{statusMsg.text}</span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Telemetry Rate Selector */}
        <div className="mt-3 border-t pt-2.5" style={{ borderColor: "var(--hair)" }}>
          <div className="flex items-center justify-between">
            <span className="label flex items-center gap-1.5">
              <Clock size={13} weight="bold" /> Send Rate
            </span>
            <div className="flex items-center gap-1">
              {RATES.map((r) => (
                <button
                  key={r.ms}
                  onClick={() => handleRate(r.ms)}
                  className={`chip !px-2 !py-0.5 !text-[11px] ${selectedRate === r.ms ? "on" : ""}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Simulation Controls (when in demo mode) */}
        {source === "demo" && (
          <div className="mt-3 border-t pt-2.5 flex items-center justify-between" style={{ borderColor: "var(--hair)" }}>
            <span className="label">Simulation Engine</span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPaused(!paused)}
                className="chip !px-2 !py-1 !text-[11px] flex items-center gap-1"
                title={paused ? "Resume simulation" : "Pause simulation"}
              >
                {paused ? <Play size={11} weight="fill" /> : <Pause size={11} weight="fill" />}
                {paused ? "Resume" : "Pause"}
              </button>
              <button
                onClick={resetScenario}
                className="chip !px-2 !py-1 !text-[11px] flex items-center gap-1"
                title="Reset scenario to t=0"
              >
                <ArrowCounterClockwise size={11} weight="bold" />
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </Bezel>
  );
}
