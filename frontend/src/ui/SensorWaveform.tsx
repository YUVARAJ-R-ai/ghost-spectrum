import { useEffect, useRef } from "react";
import { useHub } from "../lib/store";

export default function SensorWaveform() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    let animId = 0;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let scanX = 0;
    let phase = 0;

    const render = () => {
      animId = requestAnimationFrame(render);
      const w = canvas.width;
      const h = canvas.height;
      if (!w || !h) return;

      const st = useHub.getState();
      const snap = st.snap;
      const currentVal = snap?.node.sensor ?? 1012;
      const isDetected = currentVal < 500; // Hand detected

      phase += 0.08;

      // Dark futuristic glass clearing
      ctx.fillStyle = "rgba(10, 12, 18, 0.45)";
      ctx.fillRect(0, 0, w, h);

      // Subtle horizontal reference grid
      ctx.strokeStyle = "rgba(255, 255, 255, 0.04)";
      ctx.lineWidth = 1;
      for (let y = h / 3; y < h; y += h / 3) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Smooth optical carrier modulation
      ctx.beginPath();
      const points = 80;
      const step = w / (points - 1);
      const baseFreq = isDetected ? 0.35 : 0.18;
      const amp = isDetected ? 14 : 6;
      const midY = h / 2;

      for (let i = 0; i < points; i++) {
        const x = i * step;
        const carrier = Math.sin(i * baseFreq + phase) * amp;
        const sub = Math.sin(i * 0.08 - phase * 0.5) * (amp * 0.4);
        const y = midY + carrier + sub;

        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      const traceColor = isDetected ? "#ff4d6a" : "#4ade80";
      ctx.lineWidth = isDetected ? 2.2 : 1.8;
      ctx.strokeStyle = traceColor;
      ctx.shadowColor = isDetected ? "rgba(255, 77, 106, 0.85)" : "rgba(74, 222, 128, 0.6)";
      ctx.shadowBlur = isDetected ? 12 : 8;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Scanning radar line
      scanX = (scanX + 1.4) % w;
      ctx.strokeStyle = isDetected ? "rgba(255, 77, 106, 0.35)" : "rgba(74, 222, 128, 0.25)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(scanX, 0);
      ctx.lineTo(scanX, h);
      ctx.stroke();
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="relative w-full h-[50px] rounded-lg overflow-hidden border border-white/10 bg-black/40">
      <canvas
        ref={canvasRef}
        width={380}
        height={50}
        className="w-full h-full block"
      />
    </div>
  );
}
