{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  name = "kinesis-env";

  buildInputs = with pkgs; [
    platformio
    esptool
    python3
    python3Packages.pyserial
    python3Packages.numpy
    python3Packages.scipy
    python3Packages.matplotlib
  ];

  shellHook = ''
    echo "=================================================="
    echo "  KINESIS Development Environment (NixOS)"
    echo "  Devices: /dev/ttyUSB0 (TX), /dev/ttyUSB1 (RX)"
    echo "=================================================="
  '';
}
