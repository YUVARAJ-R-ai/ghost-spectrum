# Project Facts

- Name: Ghost Spectrum (Self-Healing Tri-Node IoT Mesh & Cyber Operations Console)
- Microcontrollers: 2x ESP8266 (NodeMCU 12-E/F), 1x ESP32 (ESP32-WROOM-32D)
- Frontend: React 18, TypeScript, Three.js (React Three Fiber, Drei), Tailwind CSS, Framer Motion
- Backend / Hub: Python 3, FastAPI, Uvicorn, asyncio, bidirectional UDP (port 4210)
- Protocols: UDP JSON broadcast/mesh, WebSockets (port 8500), Web Speech API STT/TTS
- Toolchain: PlatformIO Core (`pio run`), NixOS (`shell.nix`)
