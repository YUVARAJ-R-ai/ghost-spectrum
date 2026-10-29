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

    const render = () => {
      animId = requestAnimationFrame(render);
      const w = canvas.width;
      const h = canvas.height;
      if (!w || !h) return;

      const st = useHub.getState();
      const pts = st.sensors;
      const snap = st.snap;
      const currentVal = snap?.node.sensor ?? 1023;
      const isDetected = currentVal < 500; // Hand detected

      // Clear with dark tech gradient
      ctx.fillStyle = "rgba(8, 10, 16, 0.4)";
      ctx.fillRect(0, 0, w, h);

      // Subtle horizontal grid lines
      ctx.strokeStyle = "rgba(255, 255, 255, 0.05)";
      ctx.lineWidth = 1;
      for (let y = h / 4; y < h; y += h / 4) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Draw sensor waveform
      const N = 40;
      const recent = pts.slice(-N);
      if (recent.length > 1) {
        ctx.beginPath();
        const step = w / (N - 1);

        for (let i = 0; i < recent.length; i++) {
          const val = recent[i].v;
          // Invert so high proximity (low IR ADC) shows as a tall peak!
          const proximity = Math.max(0, Math.min(1023, 1023 - val));
          const y = h - 6 - (proximity / 1023) * (h - 12);
          const x = i * step;

          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        // Stroke glowing trace
        ctx.lineWidth = 2.2;
        ctx.strokeStyle = isDetected ? "#ff3b5c" : "#00f0ff";
        ctx.shadowColor = isDetected ? "rgba(255, 59, 92, 0.8)" : "rgba(0, 240, 255, 0.8)";
        ctx.shadowBlur = 10;
        ctx.stroke();
        ctx.shadowBlur = 0;
      }

      // Scanning sweep line
      scanX = (scanX + 1.2) % w;
      ctx.strokeStyle = "rgba(0, 240, 255, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(scanX, 0);
      ctx.lineTo(scanX, h);
      ctx.stroke();
    };

    animId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animId);
  }, []);

  return (
    <div className="relative w-full h-[54px] rounded-lg overflow-hidden border border-white/10 bg-black/40">
      <canvas
        ref={canvasRef}
        width={380}
        height={54}
        className="w-full h-full block"
      />
    </div>
  );
}
