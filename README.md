# KINESIS: Kinematic Inference through Non-contact Electromagnetic Sensing

An end-to-end, privacy-preserving Wi-Fi Channel State Information (CSI) sensing platform running on commodity ESP32 microcontrollers.

---

## 🌟 Complete Architecture

```
kinesis/
├── core/
│   ├── dsp.py              # Parsing, clutter subtraction, Doppler shift, feature extraction
│   ├── simulator.py        # Analytical 2.4 GHz Fresnel diffraction & multipath simulator
│   └── ml_engine.py        # Supervised gesture classifier & Doppler fallback rules
├── server/
│   └── app.py              # High-performance zero-dependency streaming server (SSE @ 60 FPS)
├── web/
│   ├── index.html          # Interactive dark-mode dashboard
│   ├── style.css           # Modern research design system
│   └── app.js              # 60 FPS HTML5 Canvas visualizers & Air-Cursor engine
├── tools/
│   ├── csi_live_monitor.py # Terminal-based real-time perturbation monitor
│   ├── csi_waterfall.py    # Standalone Matplotlib spectrogram visualizer
│   └── csi_air_cursor.py   # Standalone 2D Air Cursor script
├── firmware/
│   ├── tx/                 # ESP32 100 Hz high-rate transmitter firmware
│   └── rx/                 # ESP32 promiscuous CSI extraction firmware
├── data/                   # Saved calibration datasets & models
└── shell.nix               # Reproducible Nix development environment
```

---

## 🚀 Launching the Web Platform

Start the unified streaming platform:

```bash
nix-shell shell.nix --run "python3 server/app.py"
```

Open your browser at:
👉 **`http://localhost:8765`**

### Features on the Dashboard:
1. **Mode Switcher**:
   * **🔌 Live Hardware Mode**: Streams directly from your ESP32 receiver (`/dev/ttyUSB1`) at 100 Hz.
   * **🪐 Physics Simulator Mode**: Disables hardware noise and runs an analytical 2.4 GHz Fresnel propagation simulation with an interactive draggable hand.
2. **OFDM Subcarrier Waterfall**: 60 FPS scrolling spectrogram showing subcarrier dynamic perturbations.
3. **Doppler Velocity Spectrum**: Real-time frequency shift graph ($v_r \propto f_D$).
4. **2D Air Cursor & Air-Writing**: Responsive tracking with spring damping, gesture recognition badges (`SWIPE_LEFT`, `SWIPE_RIGHT`, `PUSH`, `PULL`, `STILL`), and in-air drawing mode.

---

## 🛠 Command Line Tools

If you prefer headless or terminal-only execution:

- **Terminal Perturbation Meter**:
  ```bash
  nix-shell shell.nix --run "python3 tools/csi_live_monitor.py -p /dev/ttyUSB1"
  ```
- **Standalone Graphical Waterfall**:
  ```bash
  nix-shell shell.nix --run "python3 tools/csi_waterfall.py -p /dev/ttyUSB1"
  ```
- **Standalone Air Cursor**:
  ```bash
  nix-shell shell.nix --run "python3 tools/csi_air_cursor.py -p /dev/ttyUSB1"
  ```
