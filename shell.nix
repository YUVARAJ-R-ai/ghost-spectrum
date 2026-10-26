{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  name = "link-doctor-env";

  buildInputs = with pkgs; [
    platformio
    arduino-cli
    esptool
    python3
    python3Packages.pyserial
    python3Packages.numpy
    python3Packages.scikit-learn
    python3Packages.fastapi
    python3Packages.uvicorn
    python3Packages.websockets
  ];

  shellHook = ''
    echo "============================================================"
    echo "  LINK DOCTOR: self-diagnosing Wi-Fi with 433 MHz fallback"
    echo "  Nodes: A = IoT ESP32, B = Uno radio gateway, C = air-watcher ESP32"
    echo "============================================================"
  '';
}
