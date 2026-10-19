// KINESIS Web Frontend Engine
let eventSource = null;
let currentMode = "hardware";
let isDrawing = false;
let drawnPoints = [];
let cursorTrail = [];

let cursorPos = { x: 0, y: 0 };
let cursorVel = { x: 0, y: 0 };

// Canvas references
const wfCanvas = document.getElementById("waterfall-canvas");
const wfCtx = wfCanvas.getContext("2d");

const dopCanvas = document.getElementById("doppler-canvas");
const dopCtx = dopCanvas.getContext("2d");

const curCanvas = document.getElementById("cursor-canvas");
const curCtx = curCanvas.getContext("2d");

const sboxCanvas = document.getElementById("sandbox-canvas");
const sboxCtx = sboxCanvas.getContext("2d");

// Waterfall ring buffer
const WF_ROWS = 100;
const WF_COLS = 126;
let wfData = Array.from({ length: WF_ROWS }, () => new Float32Array(WF_COLS));
let wfBaseline = new Float32Array(WF_COLS);

function resizeCanvas(c) {
  if (c.width !== c.clientWidth || c.height !== c.clientHeight) {
    c.width = c.clientWidth;
    c.height = c.clientHeight;
  }
}

// ---------------- SSE Connection ----------------
function connectStream() {
  if (eventSource) eventSource.close();

  const statusPill = document.getElementById("status-pill");
  const statusText = document.getElementById("status-text");

  statusPill.className = "status-pill";
  statusText.innerText = "Connecting...";

  eventSource = new EventSource("/api/stream");

  eventSource.onopen = () => {
    if (currentMode === "hardware") {
      statusPill.className = "status-pill offline";
      statusText.innerText = "Checking /dev/ttyUSB1...";
    } else {
      statusPill.className = "status-pill sim";
      statusText.innerText = "Simulator (Virtual)";
    }
  };

  eventSource.onerror = () => {
    statusPill.className = "status-pill offline";
    statusText.innerText = "Server Disconnected";
  };

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleFrame(data);
    } catch (e) {
      console.error("Frame decode error", e);
    }
  };
}

function setMode(mode) {
  currentMode = mode;
  document.getElementById("btn-hw").classList.toggle("active", mode === "hardware");
  document.getElementById("btn-sim").classList.toggle("active", mode === "simulator");

  const simBox = document.getElementById("sim-sandbox");
  const hwBanner = document.getElementById("hw-disconnect-banner");
  const simBanner = document.getElementById("sim-active-banner");
  const statusPill = document.getElementById("status-pill");
  const statusText = document.getElementById("status-text");

  if (mode === "simulator") {
    simBox.classList.remove("hidden");
    hwBanner.classList.add("hidden");
    simBanner.classList.remove("hidden");
    statusPill.className = "status-pill sim";
    statusText.innerText = "Simulator (Virtual)";
  } else {
    simBox.classList.add("hidden");
    simBanner.classList.add("hidden");
    statusPill.className = "status-pill offline";
    statusText.innerText = "Checking /dev/ttyUSB1...";
  }

  fetch("/api/set_mode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode })
  });
}

// ---------------- Frame Processing ----------------
function handleFrame(data) {
  const statusPill = document.getElementById("status-pill");
  const statusText = document.getElementById("status-text");
  const hwBanner = document.getElementById("hw-disconnect-banner");
  const simBanner = document.getElementById("sim-active-banner");

  if (currentMode === "hardware") {
    simBanner.classList.add("hidden");
    if (data.hardware_connected) {
      statusPill.className = "status-pill online";
      statusText.innerText = `ESP32 Streaming (100 Hz, #${data.seq})`;
      hwBanner.classList.add("hidden");
    } else {
      statusPill.className = "status-pill offline";
      statusText.innerText = "No ESP32 (/dev/ttyUSB1)";
      hwBanner.classList.remove("hidden");

      // Zero out telemetry and display disconnected
      document.getElementById("metric-energy").innerText = "0.00";
      document.getElementById("metric-vel").innerText = "0.00 m/s";
      document.getElementById("metric-seq").innerText = "0";
      document.getElementById("velocity-val").innerText = "0.00 m/s";

      const badge = document.getElementById("gesture-badge");
      badge.innerText = "DISCONNECTED";
      badge.style.borderColor = "#FF4D6A";
      badge.style.color = "#FF4D6A";

      latestPSD = new Array(32).fill(0);
      cursorPos.x = 0;
      cursorPos.y = 0;
      return;
    }
  } else {
    // Simulator mode
    hwBanner.classList.add("hidden");
    simBanner.classList.remove("hidden");
    statusPill.className = "status-pill sim";
    statusText.innerText = "Simulator (Virtual)";
  }

  // Update telemetry with noise deadband (prevents micro-jitter when still)
  const dispEnergy = data.energy < 0.05 ? 0.0 : data.energy;
  document.getElementById("metric-energy").innerText = dispEnergy.toFixed(2);
  document.getElementById("metric-vel").innerText = `${data.velocity.toFixed(2)} m/s`;
  document.getElementById("metric-seq").innerText = `${data.seq.toLocaleString()} pkts`;
  document.getElementById("velocity-val").innerText = `${data.velocity.toFixed(2)} m/s`;

  // Update Gesture Badge
  const badge = document.getElementById("gesture-badge");
  badge.innerText = `${data.gesture} (${Math.round(data.confidence * 100)}%)`;
  if (data.gesture === "STILL") {
    badge.style.borderColor = "#6B7B93";
    badge.style.color = "#B0BCCE";
  } else {
    badge.style.borderColor = "#00E5CC";
    badge.style.color = "#00E5CC";
  }

  // Update Waterfall Buffer directly from clean backend dynamic_amp
  if (data.amps && data.amps.length === WF_COLS) {
    const row = new Float32Array(WF_COLS);
    for (let i = 0; i < WF_COLS; i++) {
      let val = data.amps[i];
      // Interpolate DC and guard null subcarriers
      if (val === 0 && i > 0 && i < WF_COLS - 1) {
        val = (data.amps[i - 1] + data.amps[i + 1]) / 2.0;
      }
      row[i] = val;
    }
    wfData.shift();
    wfData.push(row);
  }

  // Spring-Loaded Air Pad Physics (Responsively reacts to hand gestures)
  if (data.energy > 0.10 && data.gesture !== "STILL") {
    // Responsively follow impulse
    cursorPos.x = 0.82 * cursorPos.x + 0.18 * data.dx;
    cursorPos.y = 0.82 * cursorPos.y + 0.18 * data.dy;
  } else {
    // Return firmly to dead-center
    cursorPos.x *= 0.80;
    cursorPos.y *= 0.80;
    if (Math.abs(cursorPos.x) < 0.005) cursorPos.x = 0;
    if (Math.abs(cursorPos.y) < 0.005) cursorPos.y = 0;
  }

  cursorPos.x = Math.max(-0.92, Math.min(0.92, cursorPos.x));
  cursorPos.y = Math.max(-0.92, Math.min(0.92, cursorPos.y));

  cursorTrail.push({ x: cursorPos.x, y: cursorPos.y });
  if (cursorTrail.length > 30) cursorTrail.shift();

  if (isDrawing && data.energy > 0.15) {
    drawnPoints.push({ x: cursorPos.x, y: cursorPos.y });
  }

  // Store latest PSD for rendering
  latestPSD = data.psd || [];
  latestHandPos = { x: data.hand_x || 0, y: data.hand_y || 0.35 };
}

let latestPSD = [];
let latestHandPos = { x: 0, y: 0.35 };

// ---------------- Canvas Render Loop ----------------
function render() {
  renderWaterfall();
  renderDoppler();
  renderCursor();
  if (currentMode === "simulator") renderSandbox();

  requestAnimationFrame(render);
}

function renderWaterfall() {
  resizeCanvas(wfCanvas);
  const w = wfCanvas.width;
  const h = wfCanvas.height;

  const colW = w / WF_COLS;
  const rowH = h / WF_ROWS;

  for (let r = 0; r < WF_ROWS; r++) {
    const row = wfData[r];
    for (let c = 0; c < WF_COLS; c++) {
      let val = row[c];
      // Clean up null subcarrier drops
      if (val < 0.05 && c > 1 && c < WF_COLS - 2) {
        val = (row[c - 1] + row[c + 1]) / 2.0;
      }
      if (val < 0.08) {
        wfCtx.fillStyle = "#070A12";
      } else {
        const intensity = Math.min(1.0, (val - 0.08) / 0.8);
        const red = Math.floor(intensity * 255);
        const green = Math.floor(Math.pow(intensity, 2) * 220);
        const blue = Math.floor(Math.pow(intensity, 0.5) * 120);
        wfCtx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
      }
      wfCtx.fillRect(c * colW, (WF_ROWS - 1 - r) * rowH, colW + 1, rowH + 1);
    }
  }
}

function renderDoppler() {
  resizeCanvas(dopCanvas);
  const w = dopCanvas.width;
  const h = dopCanvas.height;

  dopCtx.fillStyle = "#05070B";
  dopCtx.fillRect(0, 0, w, h);

  // Frequency axis labels & markers
  dopCtx.fillStyle = "#6B7B93";
  dopCtx.font = "10px 'JetBrains Mono', monospace";
  dopCtx.fillText("-50 Hz (Pull)", 10, 16);
  dopCtx.fillText("+50 Hz (Push)", w - 85, 16);
  dopCtx.fillText("0 Hz", w / 2 - 12, 16);

  // Center zero-Doppler dividing line
  dopCtx.strokeStyle = "rgba(255, 184, 0, 0.7)";
  dopCtx.lineWidth = 1.5;
  dopCtx.setLineDash([3, 3]);
  dopCtx.beginPath();
  dopCtx.moveTo(w / 2, 20);
  dopCtx.lineTo(w / 2, h);
  dopCtx.stroke();
  dopCtx.setLineDash([]);

  if (!latestPSD || latestPSD.length === 0) return;

  const n = latestPSD.length;
  const barW = w / n;
  const rawMax = Math.max(...latestPSD);

  // If signal is weak/idle noise, do NOT scale up noise floor
  const scale = Math.max(0.2, rawMax);

  for (let i = 0; i < n; i++) {
    const val = Math.min(1.0, latestPSD[i] / scale);
    const barH = val * (h - 32);

    // Blue for negative Doppler (pull), Cyan for positive Doppler (push)
    dopCtx.fillStyle = i < n / 2 ? "#388BFD" : "#00E5CC";
    dopCtx.fillRect(i * barW + 1, h - barH - 4, barW - 2, barH);
  }
}

function renderCursor() {
  resizeCanvas(curCanvas);
  const w = curCanvas.width;
  const h = curCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(cx, cy) * 0.85;

  curCtx.fillStyle = "#05070B";
  curCtx.fillRect(0, 0, w, h);

  // Target Circle Boundary
  curCtx.strokeStyle = "#222A3B";
  curCtx.lineWidth = 2;
  curCtx.beginPath();
  curCtx.arc(cx, cy, r, 0, Math.PI * 2);
  curCtx.stroke();

  // Crosshair
  curCtx.strokeStyle = "#161D2E";
  curCtx.beginPath();
  curCtx.moveTo(cx - 20, cy);
  curCtx.lineTo(cx + 20, cy);
  curCtx.moveTo(cx, cy - 20);
  curCtx.lineTo(cx, cy + 20);
  curCtx.stroke();

  // Drawn persistent lines
  if (drawnPoints.length > 1) {
    curCtx.strokeStyle = "#FFB800";
    curCtx.lineWidth = 4;
    curCtx.beginPath();
    for (let i = 0; i < drawnPoints.length; i++) {
      const px = cx + drawnPoints[i].x * r;
      const py = cy + drawnPoints[i].y * r;
      if (i === 0) curCtx.moveTo(px, py);
      else curCtx.lineTo(px, py);
    }
    curCtx.stroke();
  }

  // Motion Trail
  if (cursorTrail.length > 1) {
    curCtx.lineWidth = 2;
    for (let i = 0; i < cursorTrail.length - 1; i++) {
      const p1 = cursorTrail[i];
      const p2 = cursorTrail[i + 1];
      const alpha = (i / cursorTrail.length) * 0.6;
      curCtx.strokeStyle = `rgba(56, 139, 253, ${alpha})`;
      curCtx.beginPath();
      curCtx.moveTo(cx + p1.x * r, cy + p1.y * r);
      curCtx.lineTo(cx + p2.x * r, cy + p2.y * r);
      curCtx.stroke();
    }
  }

  // Cursor Dot
  const px = cx + cursorPos.x * r;
  const py = cy + cursorPos.y * r;

  curCtx.fillStyle = "#00E5CC";
  curCtx.shadowColor = "#00E5CC";
  curCtx.shadowBlur = 15;
  curCtx.beginPath();
  curCtx.arc(px, py, 12, 0, Math.PI * 2);
  curCtx.fill();
  curCtx.shadowBlur = 0;

  curCtx.strokeStyle = "#FFFFFF";
  curCtx.lineWidth = 2;
  curCtx.stroke();
}

function renderSandbox() {
  resizeCanvas(sboxCanvas);
  const w = sboxCanvas.width;
  const h = sboxCanvas.height;

  sboxCtx.fillStyle = "#05070B";
  sboxCtx.fillRect(0, 0, w, h);

  const txX = w * 0.2;
  const txY = h * 0.5;
  const rxX = w * 0.8;
  const rxY = h * 0.5;

  // Fresnel Ellipses
  sboxCtx.strokeStyle = "rgba(0, 229, 204, 0.15)";
  sboxCtx.lineWidth = 1;
  for (let el = 1; el <= 3; el++) {
    sboxCtx.beginPath();
    sboxCtx.ellipse((txX + rxX) / 2, txY, (rxX - txX) / 2 + el * 25, 25 + el * 18, 0, 0, Math.PI * 2);
    sboxCtx.stroke();
  }

  // TX & RX Antennas
  sboxCtx.fillStyle = "#388BFD";
  sboxCtx.beginPath();
  sboxCtx.arc(txX, txY, 8, 0, Math.PI * 2);
  sboxCtx.fill();
  sboxCtx.fillText("TX", txX - 10, txY + 20);

  sboxCtx.fillStyle = "#00E5CC";
  sboxCtx.beginPath();
  sboxCtx.arc(rxX, rxY, 8, 0, Math.PI * 2);
  sboxCtx.fill();
  sboxCtx.fillText("RX", rxX - 10, rxY + 20);

  // Direct LoS line
  sboxCtx.strokeStyle = "rgba(56, 139, 253, 0.4)";
  sboxCtx.setLineDash([4, 4]);
  sboxCtx.beginPath();
  sboxCtx.moveTo(txX, txY);
  sboxCtx.lineTo(rxX, rxY);
  sboxCtx.stroke();
  sboxCtx.setLineDash([]);

  // Virtual Hand
  const hx = ((latestHandPos.x + 0.5) / 1.0) * w;
  const hy = ((latestHandPos.y) / 0.8) * h;

  sboxCtx.fillStyle = "#FFB800";
  sboxCtx.shadowColor = "#FFB800";
  sboxCtx.shadowBlur = 10;
  sboxCtx.beginPath();
  sboxCtx.arc(hx, hy, 10, 0, Math.PI * 2);
  sboxCtx.fill();
  sboxCtx.shadowBlur = 0;
}

// ---------------- Interactive Hand Drag in Simulator ----------------
let isDraggingHand = false;
sboxCanvas.addEventListener("mousedown", (e) => {
  isDraggingHand = true;
  updateSimTarget(e);
});
window.addEventListener("mouseup", () => { isDraggingHand = false; });
sboxCanvas.addEventListener("mousemove", (e) => {
  if (isDraggingHand) updateSimTarget(e);
});

function updateSimTarget(e) {
  const rect = sboxCanvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) / rect.width;
  const my = (e.clientY - rect.top) / rect.height;

  const simX = (mx - 0.5) * 1.0;
  const simY = my * 0.8;

  fetch("/api/sim_target", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ x: simX, y: simY })
  });
}

function clearTrail() {
  cursorTrail = [];
  drawnPoints = [];
}

function toggleDrawing() {
  isDrawing = !isDrawing;
  const btn = document.getElementById("btn-draw");
  btn.classList.toggle("active", isDrawing);
  btn.innerText = isDrawing ? "Air Draw: ON" : "Air Draw: OFF";
}

// Start
connectStream();
render();
