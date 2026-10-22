#!/usr/bin/env python3
"""
Ghost-Spectrum Attack Injector CLI
Allows bench-testing without needing an external malicious Wi-Fi card.
"""

import sys
import argparse
import urllib.request
import json

SERVER_URL = "http://localhost:8500"

def post_endpoint(endpoint: str):
    url = f"{SERVER_URL}{endpoint}"
    req = urllib.request.Request(url, data=b"{}", headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode())
            print(f"[OK] {endpoint} -> {data}")
    except Exception as e:
        print(f"[ERROR] Failed to reach server at {url}: {e}")

def main():
    parser = argparse.ArgumentParser(description="Ghost-Spectrum Attack Simulation CLI")
    parser.add_argument("mode", choices=["benign", "deauth", "jamming", "trip", "reset", "status"],
                        help="Action to execute against the SecOps backend")
    args = parser.parse_args()

    if args.mode == "benign":
        post_endpoint("/api/simulate/benign")
    elif args.mode == "deauth":
        post_endpoint("/api/simulate/deauth")
    elif args.mode == "jamming":
        post_endpoint("/api/simulate/jamming")
    elif args.mode == "trip":
        post_endpoint("/api/action/trip")
    elif args.mode == "reset":
        post_endpoint("/api/action/reset")
    elif args.mode == "status":
        url = f"{SERVER_URL}/api/status"
        try:
            with urllib.request.urlopen(url) as resp:
                print(json.dumps(json.loads(resp.read().decode()), indent=2))
        except Exception as e:
            print(f"[ERROR] Server unreachable: {e}")

if __name__ == "__main__":
    main()
