# LINK DOCTOR: a self-diagnosing IoT link with 433 MHz radio fallback

An IoT node that keeps its data flowing when Wi-Fi breaks, and works out **why** it broke.

- **Node A** (the IoT device) sends sensor readings over real Wi-Fi and measures its own link health on every packet: signal strength, ping, packet loss and the Wi-Fi disconnect reason.
- A **trained classifier** on the laptop turns those numbers into a diagnosis: *healthy, signal fading, congested, router gone* or *password rejected*.
- An **agent** acts on the diagnosis and explains each decision in plain English:
  - **Signal fading:** switch to 433 MHz radio *before* the Wi-Fi drops (make-before-break).
  - **Congested:** stay on Wi-Fi and halve the send rate.
  - **Router gone:** ride it out on radio and rejoin automatically.
  - **Password rejected:** alert a human, because retrying won't help.
- **Store-and-forward:** any reading Wi-Fi fails to confirm within 0.8 s is resent over radio. The dashboard counts readings lost, and the target is **0**.
- Every outage produces an incident report sealed with SHA-256.

```
             real Wi-Fi (phone hotspot)                     USB
  Node A ───────────────────────────────▶ Laptop hub ◀─────────── Node B (ESP32)
  ESP32 + IR + OLED + buzzer    ◀── agent commands ──┘  graph · model · agent      ▲
  + FS1000A 433 MHz TX ─────────────────── 433 MHz radio ──────────────────────────┘
                                                        ◀── USB ── Node C (ESP32, optional)
                                                                   counts traffic / deauths on the hotspot's channel
```

The node never depends on the laptop to fail over. Its own reflex is: no Wi-Fi, or 3 unanswered packets, means switch to radio. The laptop agent adds the *early* switch and the other decisions, while Wi-Fi can still carry its commands.

## Run it

```bash
# 1. Just look at the dashboard (no hardware, no hub): needs Node 20+
cd frontend && npm install && npm run dev        # open http://localhost:5173/app/

# 2. Run the hub with the built dashboard (Python only, no Node needed)
nix-shell                                        # or: pip install fastapi uvicorn pyserial scikit-learn joblib
python3 server/app.py                            # open http://localhost:8500
python3 tools/fake_node.py                       # optional: fake Node A, type: nominal, fading, congestion, ap_down, auth_fail

# 3. Real hardware
cp firmware/mission_node_esp32/include/secrets.example.h firmware/mission_node_esp32/include/secrets.h
pio run -d firmware/mission_node_esp32 -t upload --upload-port /dev/ttyUSB0   # Node A, then B and C as in Setup below
python3 server/app.py

# 4. Teach and train a model, then press "Reload model" in the Diagnosis tab
python3 tools/train.py

# 5. Checks
python3 tests/test_hub.py                        # hub self-checks
cd frontend && npm run build                     # typecheck + rebuild web/dist (commit it)
```

Without a hub the dashboard plays its own simulator, so step 1 is enough to see everything.

## Hardware

| Node | Parts | Job |
|---|---|---|
| A · IoT device | ESP32 DevKit, FS1000A 433 MHz TX, analog IR proximity sensor, active buzzer module, SSD1306 OLED *(optional)* | Sends readings, measures the link, falls back to radio |
| B · radio gateway | ESP32 DevKit, XY-MK-5V 433 MHz RX, 5 V relay module | Receives radio frames and forwards them over USB; the relay clicks during fallback |
| C · air watcher *(optional)* | ESP32 DevKit **without** NRF24 | Sniffs the hotspot's channel: traffic and deauth frames per second |
| "The router" | Your phone's hotspot | The thing the examiner switches off / walks away with |

Solder a **17.3 cm straight wire** to the ANT pad of both 433 MHz modules. Without antennas the range is a few cm.

### Wiring: Node A (ESP32)

| Part | Pin | ESP32 |
|---|---|---|
| FS1000A | VCC / GND / DATA | VIN (5 V) / GND / GPIO 17 |
| IR proximity module | VCC → **3V3** · GND → GND · AO (analog out) → **GPIO 34** |
| Buzzer module | VCC / GND / I/O | 3V3 / GND / GPIO 25 |
| OLED *(optional)* | VCC / GND / SDA / SCL | **VIN (5 V)** / GND / GPIO 21 / GPIO 22 |

GPIO 34 is on ADC1 on purpose: the ADC2 pins stop working while Wi-Fi is on. Power the IR module from 3V3 so its analog out never exceeds the ESP32’s 3.3 V input.

The OLED is **optional** — Node A's full status is on the laptop dashboard, so the device works headless. If you do fit it, power its VCC from **VIN (5 V)**, not 3V3: on a USB-powered DevKit the weak 3V3 regulator can brown out under the OLED's load. The firmware detects a missing OLED and carries on. Keep its SDA/SCL on GPIO 21/22 only — never on the TX/RX (GPIO 1/3) or GPIO 12 pins, which break booting and flashing.

### Wiring: Node B (ESP32)

| Part | Pin | ESP32 |
|---|---|---|
| XY-MK-5V | VCC / GND / DATA | **3V3** / GND / GPIO 4 |
| Relay | VCC / GND / IN | VIN (5 V) / GND / GPIO 13 |

Power the 433 MHz **receiver from 3V3**, not 5 V: at 5 V its DATA line would push 5 V into the ESP32 and could damage the pin. 3V3 slightly cuts range, which is fine for a desk demo.

### Node C
Plain ESP32 on USB, nothing attached. **Leave the NRF24 disconnected.** The flashing failure (`invalid header: 0xffffffff`) came from it loading the 3.3 V rail.

## Setup

```bash
nix-shell                      # platformio, python, fastapi, scikit-learn

# 1. Hotspot credentials for Node A
cp firmware/mission_node_esp32/include/secrets.example.h firmware/mission_node_esp32/include/secrets.h
$EDITOR firmware/mission_node_esp32/include/secrets.h

# 2. Flash (plug one board at a time; check the port with `ls /dev/ttyUSB* /dev/ttyACM*`)
pio run -d firmware/mission_node_esp32 -t upload --upload-port /dev/ttyUSB0   # Node A
pio run -d firmware/gateway_node_esp32  -t upload --upload-port /dev/ttyUSB1  # Node B
pio run -d firmware/sentinel_esp32     -t upload --upload-port /dev/ttyUSB0   # Node C (optional)

# 3. Let Node A's UDP packets through the NixOS firewall (until reboot)
sudo iptables -I nixos-fw 1 -p udp --dport 4210 -j nixos-fw-accept

# 4. Connect the LAPTOP to the same phone hotspot, plug Node B (+ C) into USB, then:
python3 server/app.py          # dashboard on http://localhost:8500
```

Open **http://localhost:8500**. You get the 3D dashboard (see below). The original plain dashboard is still at `/classic`.

Power Node A from a power bank so it's visibly wireless. The hub finds Node B and Node C on USB by what they print. To force a port, use `GATEWAY_PORT=/dev/ttyUSB1` or `SENTINEL_PORT=/dev/ttyUSB1`.

If an ESP32 won't flash: hold **BOOT**, tap **EN**, release BOOT when "Connecting..." appears.

## The 3D dashboard

The main screen is a 3D stage of the whole system. Node A, the router, the laptop hub, the gateway and the air watcher stand on a platform. Two glowing routes join them: Wi-Fi in blue, 433 MHz radio in amber. Every reading the hub receives flies along the route that carried it. Wi-Fi readings come back as a pale acknowledgement. A lost reading turns red and bursts.

| Tab | What it shows |
|---|---|
| Stage | The 3D scene, the active path in large type, delivered and lost counters, the diagnosis, and the agent's notes. Click any node to fly to it and see its live numbers. |
| Timeline | Every reading over time, coloured by path, with the Wi-Fi signal underneath, problem bands and lost readings. |
| Diagnosis | A radar of the classifier's probabilities, the numbers it sees, and the rules (or the model's top features). |
| Incidents | Each outage's sealed report. Your browser re-computes the SHA-256 seal, so an edited file shows as broken. |
| Teach | The guided recording flow for training data. |

Keys: `1` to `5` switch tabs, `Esc` closes a node card.

**No hardware? No server?** The page has a built-in simulator. When it cannot reach a hub it plays a scripted story: fading signal, congestion, router gone, password change, deauth attack. Pick a failure by hand in the panel on the right. The switch in the header (Live / Demo) shows which source you are looking at. The **Link Doctor protection** switch in demo mode turns off the radio fallback and the agent, so you can watch a plain Wi-Fi node lose readings during an outage.

**Changing the dashboard** needs Node 20 or newer. The built app is committed in `web/dist/`, so running the hub needs no Node.

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173/app/ , talks to a hub on :8500 if one is running
npm run build      # writes web/dist/ , which the hub serves at /app/
```

See `frontend/README.md` for how it is built.

## Teaching the model (about 45 minutes)

The dashboard's **Teach the model** panel labels every reading while you reproduce a failure. Record **each label twice**, in two separate sessions of about 3 minutes, so the accuracy score is honest (it's computed on sessions the model never saw).

| Label | How to reproduce it |
|---|---|
| Healthy | Leave it alone, then move the phone around normally |
| Signal fading | Put the **phone** (not Node A, whose radio must stay clear) in a biscuit tin and close the lid slowly, or walk away with it |
| Congested | Phone on the hotspot running a speed test or a 4K video, with other devices on the hotspot downloading |
| Router gone | Switch the hotspot off |
| Password rejected | Change the hotspot password (the node keeps the old one) |

Press **Stop** between sessions. Then:

```bash
python3 tools/train.py         # prints held-out accuracy, confusion matrix, top features
```

and click **Reload model** on the dashboard. Until a model exists, hand-written rules make the diagnosis, and the dashboard says so.

## Testing without hardware

```bash
python3 server/app.py &
python3 tools/fake_node.py     # type: nominal, fading, congestion, ap_down, auth_fail
python3 tests/test_hub.py      # merge / lost-count / agent decision self-checks
```

`fake_node.py` stands in for Node A and Node B. It is for development only; the demo runs on real radios.

## The demo (5 minutes)

1. **Live data.** Wave a hand in front of the IR sensor, and the blue line follows. "Every reading is confirmed by the laptop."
2. **Hand her the phone and a biscuit tin. Ask her to put the phone in and close the lid slowly.** The RSSI line slides down, and the diagnosis becomes *Signal fading*. The agent switches to radio **before** the drop, the line turns teal then amber, the buzzer beeps and the relay clicks. Readings lost: **0**.
3. **She opens the lid.** About 4 s of healthy link, then the agent releases the node to Wi-Fi.
4. **Ask her to switch the hotspot off.** Diagnosis: *Router gone*. The node is on radio by reflex. Wave at the sensor: the amber line still follows. Turn the hotspot on and it rejoins automatically.
5. **Change the hotspot password.** *Password rejected* appears, with a red banner: a human is needed.
6. **Show the incident report** (`server/incidents/`): diagnoses, actions, readings carried by radio, readings lost, and the SHA-256 seal. Then show `tools/train.py`'s confusion matrix.

## Code map

| Path | What |
|---|---|
| `firmware/mission_node_esp32` | Node A: Wi-Fi + link metrics + reflex + store-and-forward + 433 MHz TX |
| `firmware/gateway_node_esp32` | Node B: 433 MHz RX → JSON over USB, relay |
| `firmware/sentinel_esp32` | Node C: promiscuous Wi-Fi frame counter |
| `server/app.py` | Hub: UDP + serial ingest, path merging, lost counting, dashboard websocket, data recording |
| `server/brain.py` | Features, rule fallback, model loading, the agent |
| `server/forensic.py` | SHA-256 incident reports |
| `tools/train.py` | Trains and scores the RandomForest |
| `web/` | The original plain dashboard (`/classic`) and the built 3D dashboard (`web/dist`, served at `/app/`) |
| `frontend/` | Source of the 3D dashboard: React, three.js, a built-in simulator |
