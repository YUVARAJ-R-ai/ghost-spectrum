import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Microphone,
  PaperPlaneTilt,
  SpeakerHigh,
  SpeakerSimpleSlash,
  TerminalWindow,
  X,
  Lightning,
  Cloud,
  Cpu,
} from "@phosphor-icons/react";
import { sendChatCommand } from "../lib/api";

interface ChatMessage {
  id: string;
  sender: "operator" | "cluster";
  text: string;
  action?: string;
  engine?: "bedrock" | "jev" | "auto";
  model?: string;
  latency_ms?: number;
  t: number;
}

const QUICK_COMMANDS = [
  { label: "⚡ Jamming", text: "simulate jamming on node 3" },
  { label: "🔔 Test Alarm", text: "test supervisor buzzer" },
  { label: "🟢 Re-Arm", text: "clear alerts and rearm" },
  { label: "🎯 Calibrate", text: "calibrate optical sensor" },
  { label: "⚡ Fast 250ms", text: "set rate to 250ms" },
  { label: "📊 Status", text: "cluster status report" },
];

export default function VoiceChatConsole() {
  const [open, setOpen] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceReply, setVoiceReply] = useState(true);
  const [engine, setEngine] = useState<"auto" | "bedrock" | "jev">("auto");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "msg-0",
      sender: "cluster",
      text: "Ghost Spectrum Voice & Tactical Command Hub online. Powered by AWS Bedrock & Local JEV Autonomic Engine.",
      action: "READY",
      engine: "auto",
      t: Date.now(),
    },
  ]);

  const recognitionRef = useRef<any>(null);
  const endRef = useRef<HTMLDivElement>(null);

  // Initialize Web Speech API for voice recognition
  useEffect(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recog = new SpeechRecognition();
      recog.continuous = false;
      recog.interimResults = false;
      recog.lang = "en-US";

      recog.onstart = () => setListening(true);
      recog.onend = () => setListening(false);
      recog.onerror = () => setListening(false);
      recog.onresult = (e: any) => {
        const transcript = e.results[0][0].transcript;
        if (transcript) {
          setInput(transcript);
          handleSend(transcript);
        }
      };
      recognitionRef.current = recog;
    }
  }, []);

  useEffect(() => {
    if (open) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, open]);

  // Text-to-speech vocal response
  const speak = (text: string) => {
    if (!voiceReply || !("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    // Clean out emoji / tag prefixes for natural voice pronunciation
    const clean = text.replace(/^[^\w\s]+/, "").replace(/\[.*?\]/g, "").trim();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.rate = 1.05;
    utter.pitch = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(
      (v) => v.lang.startsWith("en") && (v.name.includes("Google") || v.name.includes("Natural") || v.name.includes("Female"))
    );
    if (naturalVoice) utter.voice = naturalVoice;
    window.speechSynthesis.speak(utter);
  };

  const toggleMic = () => {
    if (!recognitionRef.current) {
      alert("Speech recognition is not supported in this browser. Please use Chrome or Edge.");
      return;
    }
    if (listening) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  const handleSend = async (customText?: string) => {
    const textToSend = (customText ?? input).trim();
    if (!textToSend || busy) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}-u`,
      sender: "operator",
      text: textToSend,
      engine: engine,
      t: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setBusy(true);

    try {
      const res = await sendChatCommand(textToSend, engine);
      const replyText = res?.reply ?? "Command executed.";
      const clusterMsg: ChatMessage = {
        id: `msg-${Date.now()}-c`,
        sender: "cluster",
        text: replyText,
        action: res?.action,
        engine: res?.engine,
        model: res?.model,
        latency_ms: res?.latency_ms,
        t: Date.now(),
      };
      setMessages((prev) => [...prev, clusterMsg]);
      speak(replyText);
    } catch {
      const errMsg: ChatMessage = {
        id: `msg-${Date.now()}-err`,
        sender: "cluster",
        text: "Error communicating with cluster gateway.",
        t: Date.now(),
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Omni-present Floating HUD Trigger Button */}
      <div className="fixed bottom-5 right-5 z-40">
        <button
          onClick={() => setOpen(!open)}
          className="group flex items-center gap-2 rounded-full px-3.5 py-2 text-[12px] font-semibold transition-all duration-300"
          style={{
            background: open ? "rgba(100,200,255,.18)" : "rgba(18,20,29,.85)",
            border: `1px solid ${open ? "var(--accent)" : "var(--hair)"}`,
            boxShadow: open
              ? "0 0 25px -4px var(--accent)"
              : "0 8px 32px -8px rgba(0,0,0,.6)",
            backdropFilter: "blur(12px)",
            color: open ? "var(--ink)" : "var(--muted)",
          }}
          title="Open Voice & Chat Network Console"
        >
          <span className="relative grid h-6 w-6 place-items-center rounded-full"
            style={{ background: listening ? "rgba(255,92,108,.25)" : "rgba(255,255,255,.08)", color: listening ? "var(--bad)" : "var(--accent)" }}>
            <Microphone size={15} weight={listening ? "fill" : "regular"} className={listening ? "breathe" : ""} />
            {listening && <span className="absolute inset-0 rounded-full border border-[var(--bad)] animate-ping" />}
          </span>
          <span className="mono tracking-tight font-medium">Bedrock & JEV Voice</span>
          <span className="text-[10px] opacity-60">{open ? "▼" : "▲"}</span>
        </button>
      </div>

      {/* Slide-in Cyber Voice Terminal Drawer */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
            className="fixed bottom-16 right-5 z-40 w-[410px] max-w-[92vw] overflow-hidden rounded-2xl border"
            style={{
              borderColor: "var(--hair)",
              background: "rgba(10,12,18,.94)",
              backdropFilter: "blur(20px)",
              boxShadow: "0 16px 48px -12px rgba(0,0,0,.85), 0 0 1px 1px rgba(255,255,255,.08)",
            }}
          >
            {/* Terminal Header */}
            <div className="flex items-center justify-between border-b px-4 py-3" style={{ borderColor: "var(--hair)", background: "rgba(255,255,255,.02)" }}>
              <div className="flex items-center gap-2.5">
                <TerminalWindow size={16} weight="light" style={{ color: "var(--accent)" }} />
                <div>
                  <div className="text-[12.5px] font-semibold tracking-tight">Tactical AI Console</div>
                  <div className="mono text-[9.5px] text-[var(--muted)] flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--good)] inline-block" />
                    AWS Bedrock + Local JEV Dual-Engine
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1">
                {/* Voice audio response toggle */}
                <button
                  onClick={() => setVoiceReply(!voiceReply)}
                  className="grid h-7 w-7 place-items-center rounded-lg hover:bg-white/10 transition-colors"
                  style={{ color: voiceReply ? "var(--accent)" : "var(--faint)" }}
                  title={voiceReply ? "Voice speech feedback enabled" : "Voice muted"}
                >
                  {voiceReply ? <SpeakerHigh size={15} /> : <SpeakerSimpleSlash size={15} />}
                </button>
                <button
                  onClick={() => setOpen(false)}
                  className="grid h-7 w-7 place-items-center rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition-colors"
                  aria-label="Close terminal"
                >
                  <X size={14} />
                </button>
              </div>
            </div>

            {/* AI Engine Selector Bar */}
            <div className="flex items-center justify-between border-b px-3.5 py-1.5 text-[10px] mono" style={{ borderColor: "var(--hair)", background: "rgba(0,0,0,.3)" }}>
              <span className="text-[var(--muted)]">ENGINE:</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setEngine("auto")}
                  className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 ${
                    engine === "auto"
                      ? "bg-white/15 text-white font-semibold"
                      : "text-[var(--muted)] hover:text-white"
                  }`}
                  title="Auto-route: Fast tools to JEV, reasoning to Bedrock"
                >
                  <Cpu size={11} /> Auto
                </button>
                <button
                  onClick={() => setEngine("bedrock")}
                  className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 ${
                    engine === "bedrock"
                      ? "bg-[rgba(56,189,248,.2)] text-[var(--accent)] font-semibold border border-[rgba(56,189,248,.4)]"
                      : "text-[var(--muted)] hover:text-white"
                  }`}
                  title="AWS Bedrock (Amazon Nova Lite cloud reasoning)"
                >
                  <Cloud size={11} /> Bedrock
                </button>
                <button
                  onClick={() => setEngine("jev")}
                  className={`px-2 py-0.5 rounded transition-all flex items-center gap-1 ${
                    engine === "jev"
                      ? "bg-[rgba(52,211,153,.2)] text-[var(--good)] font-semibold border border-[rgba(52,211,153,.4)]"
                      : "text-[var(--muted)] hover:text-white"
                  }`}
                  title="Local JEV: Sub-5ms on-device fast tool calling & autonomic link agent"
                >
                  <Lightning size={11} /> JEV Local
                </button>
              </div>
            </div>

            {/* Message Feed */}
            <div className="h-[240px] overflow-y-auto p-3.5 space-y-2.5 scroll-thin text-[12px]">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={`flex flex-col ${m.sender === "operator" ? "items-end" : "items-start"}`}
                >
                  <div className="mono text-[9px] text-[var(--muted)] mb-0.5 px-1 flex items-center gap-1.5">
                    <span>{m.sender === "operator" ? "OPERATOR" : "INTELLIGENCE"}</span>
                    {m.engine && (
                      <span className="rounded px-1 py-0.2 text-[8px] font-semibold uppercase"
                        style={{
                          background: m.engine === "bedrock" ? "rgba(56,189,248,.15)" : "rgba(52,211,153,.15)",
                          color: m.engine === "bedrock" ? "var(--accent)" : "var(--good)"
                        }}>
                        {m.engine === "bedrock" ? "☁️ Bedrock" : "⚡ JEV"}
                      </span>
                    )}
                    {m.latency_ms !== undefined && (
                      <span className="text-[8px] opacity-50">{m.latency_ms}ms</span>
                    )}
                    {m.action && (
                      <span className="rounded px-1 text-[8.5px] font-semibold tracking-wider uppercase ml-auto"
                        style={{ background: "rgba(100,200,255,.12)", color: "var(--accent)" }}>
                        {m.action}
                      </span>
                    )}
                  </div>
                  <div
                    className="max-w-[90%] rounded-xl px-3 py-2 leading-relaxed"
                    style={{
                      background:
                        m.sender === "operator"
                          ? "rgba(100,200,255,.12)"
                          : "rgba(255,255,255,.04)",
                      border: `1px solid ${
                        m.sender === "operator"
                          ? "rgba(100,200,255,.25)"
                          : "var(--hair)"
                      }`,
                      color: m.sender === "operator" ? "#e0f2fe" : "var(--ink)",
                    }}
                  >
                    {m.text}
                  </div>
                </div>
              ))}
              {busy && (
                <div className="flex items-center gap-2 text-[11px] mono text-[var(--muted)] py-1">
                  <span className="h-2 w-2 rounded-full bg-[var(--accent)] animate-ping" />
                  {engine === "bedrock" ? "Reasoning with AWS Bedrock..." : "Evaluating with Local JEV..."}
                </div>
              )}
              <div ref={endRef} />
            </div>

            {/* Quick Tactical Prompt Chips */}
            <div className="border-t px-3 py-2 flex items-center gap-1.5 overflow-x-auto scroll-none" style={{ borderColor: "var(--hair)" }}>
              {QUICK_COMMANDS.map((q) => (
                <button
                  key={q.label}
                  onClick={() => handleSend(q.text)}
                  className="chip whitespace-nowrap !px-2 !py-0.5 !text-[10px] hover:border-[var(--accent)] transition-all"
                >
                  {q.label}
                </button>
              ))}
            </div>

            {/* Command Input & Mic Bar */}
            <div className="border-t p-2.5 flex items-center gap-2" style={{ borderColor: "var(--hair)", background: "rgba(0,0,0,.2)" }}>
              <button
                onClick={toggleMic}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all"
                style={{
                  background: listening ? "rgba(255,92,108,.2)" : "rgba(255,255,255,.06)",
                  color: listening ? "var(--bad)" : "var(--accent)",
                  border: `1px solid ${listening ? "var(--bad)" : "var(--hair)"}`,
                }}
                title={listening ? "Stop listening" : "Click to speak voice command"}
              >
                <Microphone size={17} weight={listening ? "fill" : "regular"} className={listening ? "breathe" : ""} />
              </button>

              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder={listening ? "Listening to voice input..." : `Type or speak (${engine.toUpperCase()})...`}
                className="w-full rounded-xl px-3 py-2 text-[12px] mono focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
                style={{
                  background: "rgba(255,255,255,.04)",
                  border: "1px solid var(--hair)",
                  color: "var(--ink)",
                }}
              />

              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || busy}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl transition-all disabled:opacity-40"
                style={{
                  background: input.trim() ? "var(--accent)" : "rgba(255,255,255,.06)",
                  color: input.trim() ? "#050507" : "var(--muted)",
                }}
                aria-label="Send command"
              >
                <PaperPlaneTilt size={15} weight="fill" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
