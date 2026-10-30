# Ghost Spectrum · 3D Mission Control & Cyber Operations Console

React 18, TypeScript, Three.js (React Three Fiber, Drei) and Tailwind CSS.
Builds to `../web/dist` and is served by the FastAPI edge hub at `http://localhost:8500/app/`.

```bash
npm install
npm run dev       # Vite dev server on :5173 (proxies /ws and /api to :8500)
npm run build     # Strict typecheck + compile into ../web/dist
```

All fonts, shaders, and icons are bundled locally for 100% offline air-gap operation.

---

## Architecture & Data Flow

- **WebSocket Stream (`src/lib/useHub.ts`)**: Connects to `ws://<hub>:8500/ws`. Subscribes to high-frequency state snapshots from the cluster.
- **Offline Simulator (`src/lib/sim.ts`)**: When running disconnected from hardware, simulates autonomous cluster telemetry, packet drops, fading links, and cyber anomalies.
- **Zustand State Engine (`src/lib/store.ts`)**: Synchronizes real-time metrics, rolling 60s ring buffers, event timelines, and node status.
- **3D Render Loop (`src/scene/`)**: The Three.js canvas reads an imperatively smoothed state object (`S` in `world.ts`) on every frame (`useFrame`), avoiding React reconciliation overhead and running smoothly at 60 FPS.
  - **Node 1 (Sensor)**: Cyan optical pulse link and telemetry beacon.
  - **Node 2 (Supervisor)**: Emerald supervisory link with live OLED and alarm state.
  - **Node 3 (Sentinel)**: Violet cyber sweep link flaring into red shockwave particles during attack bursts.
- **Voice & Chat Orchestrator (`src/ui/VoiceChatConsole.tsx`)**:
  - Web Speech STT (Speech-to-Text) with live mic visualization.
  - Edge command dispatcher to `POST /api/chat/command` (alarm triggers, zeroing, jamming simulation, rate throttling).
  - Speech synthesis (TTS) vocal telemetry feedback.
- **Decoupled Telemetry & Optical Analyzer**:
  - `Timeline.tsx`: Plots genuine network RTT latency (ms) and RSSI (dBm), with an event log filterable by category.
  - `SensorWaveform.tsx`: 60 FPS synthetic optical carrier spectrum analyzer responding directly to analog proximity intrusion.

---

## Directory Layout

| Path | Purpose |
|---|---|
| `src/lib/` | Types, Zustand stores, simulator, API client, cryptographic seal verification |
| `src/scene/` | Three.js scene: 3D node meshes, shader wires, multi-node particle links, ripples, camera rig |
| `src/ui/` | Tactical glass HUD, Voice & Chat Console, Sensor Waveform, Timeline, Forensics panel |

---

## Verification & Build

```bash
npx tsc --noEmit                 # TypeScript strict verification
npm run build                    # Production build into ../web/dist
```
