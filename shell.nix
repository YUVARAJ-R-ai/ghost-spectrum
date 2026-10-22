{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  name = "ghost-spectrum-env";

  buildInputs = with pkgs; [
    platformio
    arduino-cli
    esptool
    python3
    python3Packages.pyserial
    python3Packages.numpy
    python3Packages.scipy
    python3Packages.fastapi
    python3Packages.uvicorn
    python3Packages.websockets
  ];

  shellHook = ''
    echo "============================================================"
    echo "  GHOST-SPECTRUM Cyber-Physical RF Resilience Environment"
    echo "  Nodes: ESP32 Sentinel, ESP32 Mission, Arduino Uno Airgap"
    echo "============================================================"
  '';
}
