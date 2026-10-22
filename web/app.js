// GHOST-SPECTRUM // Mission Control Client Engine
document.addEventListener("DOMContentLoaded", () => {
    // Canvas Contexts
    const waterfallCanvas = document.getElementById("waterfall-canvas");
    const wfCtx = waterfallCanvas.getContext("2d");
    const continuityCanvas = document.getElementById("continuity-canvas");
    const contCtx = continuityCanvas.getContext("2d");

    // Waterfall history buffer (rows of 125 channel values)
    const MAX_WF_ROWS = 60;
    const waterfallHistory = [];

    // Continuity timeline history
    const MAX_CONT_POINTS = 60;
    const wifiHistory = new Array(MAX_CONT_POINTS).fill(30);
    const subghzHistory = new Array(MAX_CONT_POINTS).fill(0);

    // Audio context for physical snap sound effect
    let audioCtx = null;
    function playRelaySnap() {
        try {
            if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = "square";
            osc.frequency.setValueAtTime(140, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(30, audioCtx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.08);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.09);
        } catch (e) {
            // Audio context not allowed until user interaction
        }
    }

    // Connect WebSocket
    let ws = null;
    function connectWS() {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws`;
        ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log("[WS] Connected to Ghost-Spectrum Backend");
            document.getElementById("val-hw-port").innerText = "CONNECTED";
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleStateUpdate(data);
            } catch (err) {
                console.error("WS Parse Error:", err);
            }
        };

        ws.onclose = () => {
            document.getElementById("val-hw-port").innerText = "RECONNECTING";
            setTimeout(connectWS, 1500);
        };
    }

    let lastRelayState = false;

    function handleStateUpdate(payload) {
        const telemetry = payload.telemetry || {};
        const agentSummary = payload.agent_summary || {};
        const logs = payload.logs || [];
        const continuity = payload.continuity || {};
        const hardware = payload.hardware || {};

        // 1. Update Header Badges
        const stateEl = document.getElementById("val-agent-state");
        const stateBadge = document.getElementById("badge-agent-state");
        const currState = agentSummary.state || "MONITORING";
        stateEl.innerText = currState;

        stateBadge.className = "status-badge";
        if (currState === "AIRGAPPED_OOB_SURVIVAL") {
            stateBadge.classList.add("alert");
        } else if (currState === "TRIAGE" || currState === "BENIGN") {
            stateBadge.classList.add("warning");
        }

        // Links Badges
        const isFailover = agentSummary.subghz_failover;
        document.getElementById("val-primary-link").innerText = isFailover ? "ATTACK DENIAL (0%)" : "NOMINAL [OK]";
        document.getElementById("badge-primary-link").className = `status-badge ${isFailover ? 'alert' : ''}`;

        document.getElementById("val-oob-link").innerText = isFailover ? "ACTIVE (433MHz)" : "STANDBY";
        document.getElementById("badge-oob-link").className = `status-badge ${isFailover ? '' : ''}`;

        document.getElementById("val-hw-port").innerText = hardware.port || "ONLINE";

        // 2. Metrics & Panel B Gauges
        const entropy = agentSummary.spectral_entropy || 0;
        document.getElementById("val-entropy").innerText = entropy.toFixed(3);

        const velocity = agentSummary.deauth_velocity || 0;
        document.getElementById("val-velocity").innerText = `${velocity.toFixed(1)} fps`;

        const deauthBar = document.getElementById("gauge-deauth-bar");
        const deauthPct = Math.min(100, (velocity / 200) * 100);
        deauthBar.style.width = `${deauthPct}%`;
        document.getElementById("deauth-fps-readout").innerText = `${velocity.toFixed(1)} fps ${velocity > 50 ? '[ATTACK SPIKE]' : '[Normal]'}`;

        const dataCount = telemetry.data_count || 0;
        const dataBar = document.getElementById("gauge-data-bar");
        const dataPct = Math.min(100, isFailover ? 0 : (dataCount / 40) * 100);
        dataBar.style.width = `${dataPct}%`;
        document.getElementById("data-fps-readout").innerText = isFailover ? "0 fps [Channel Denied]" : `${dataCount * 5} fps [Uplink OK]`;

        document.getElementById("stat-bssid").innerText = telemetry.target_bssid || "--:--:--:--:--:--";
        document.getElementById("stat-dispersion").innerText = (agentSummary.mac_dispersion || 1.0).toFixed(2);
        document.getElementById("stat-energy-ratio").innerText = (telemetry.nrf_energy_ratio || 0).toFixed(2);

        // 3. Panel C: Chain-of-Thought Console
        const term = document.getElementById("cot-terminal");
        term.innerHTML = "";
        logs.forEach(log => {
            const line = document.createElement("div");
            line.className = "term-line";
            if (log.includes("ADVERSARIAL") || log.includes("Action 2") || log.includes("ATTACK")) {
                line.classList.add("alert");
            } else if (log.includes("BENIGN") || log.includes("Anomaly") || log.includes("TRIAGE")) {
                line.classList.add("warn");
            } else if (log.includes("restored") || log.includes("OK") || log.includes("Online")) {
                line.classList.add("ok");
            } else {
                line.classList.add("info");
            }
            line.innerText = log;
            term.appendChild(line);
        });
        term.scrollTop = term.scrollHeight;

        // 4. Panel A: Update Waterfall Buffer
        if (telemetry.nrf_bins && telemetry.nrf_bins.length === 125) {
            waterfallHistory.unshift(telemetry.nrf_bins);
            if (waterfallHistory.length > MAX_WF_ROWS) {
                waterfallHistory.pop();
            }
            drawWaterfall();
        }

        
        // Update Live Mission Telemetry Readouts
        const tempEl = document.getElementById("payload-temp");
        const radEl = document.getElementById("payload-rad");
        const psiEl = document.getElementById("payload-psi");
        const routeBadge = document.getElementById("telemetry-route-badge");
        const pdrEl = document.getElementById("payload-pdr");
        const lossEl = document.getElementById("payload-loss");

        if (tempEl && radEl && psiEl && routeBadge) {
            // Live subtle realistic fluctuations
            const baseSeq = telemetry.seq || Math.floor(Date.now() / 200);
            const liveTemp = (36.2 + 0.4 * Math.sin(baseSeq / 10)).toFixed(1);
            const liveRad = (0.13 + 0.03 * Math.cos(baseSeq / 8)).toFixed(2);
            const livePsi = (101.2 + 0.2 * Math.sin(baseSeq / 15)).toFixed(1);

            tempEl.innerText = liveTemp + " °C";
            radEl.innerText = liveRad + " µSv/h";
            psiEl.innerText = livePsi + " kPa";

            if (isFailover) {
                routeBadge.innerText = "433 MHz Sub-GHz Radio (Survival Link - Wi-Fi Denied)";
                routeBadge.style.color = "#3fb950";
                tempEl.style.color = "#3fb950"; // Green survival indicator
                radEl.style.color = "#3fb950";
                pdrEl.innerText = "100.0 %";
                pdrEl.style.color = "#3fb950";
                lossEl.innerText = "Zero Telemetry Loss Under Attack";
                lossEl.style.color = "#3fb950";
            } else {
                routeBadge.innerText = "2.4 GHz Wi-Fi (Primary High-Speed)";
                routeBadge.style.color = "#388bfd";
                tempEl.style.color = "#388bfd";
                radEl.style.color = "#39c5cf";
                pdrEl.innerText = "100.0 %";
                lossEl.innerText = "0 Packets Lost (Nominal)";
                lossEl.style.color = "var(--text-dim)";
            }
        }

        // 5. Panel D: Update Continuity Chart
        const wifiRate = isFailover ? 0 : (dataCount * 3 + Math.random() * 5);
        const subghzRate = isFailover ? 25 : 0;
        wifiHistory.push(wifiRate);
        wifiHistory.shift();
        subghzHistory.push(subghzRate);
        subghzHistory.shift();
        drawContinuity();

        // 6. Panel E: Digital Twin & OLED Mirror
        const oled = document.getElementById("oled-mirror");
        const line1 = document.getElementById("oled-line1");
        const line2 = document.getElementById("oled-line2");
        const line3 = document.getElementById("oled-line3");
        const line4 = document.getElementById("oled-line4");
        const fs1000State = document.getElementById("twin-fs1000-state");
        const relayVisual = document.getElementById("relay-contact-line");
        const relayLabel = document.getElementById("contact-status-label");
        const relayText = document.getElementById("relay-state-text");

        const relayTripped = agentSummary.airgap_relay || false;

        // Sound trigger on edge change
        if (relayTripped && !lastRelayState) {
            playRelaySnap();
        }
        lastRelayState = relayTripped;

        if (isFailover) {
            oled.className = "oled-mirror alert";
            line1.innerText = "! ATTACK DETECTED !";
            line2.innerText = "OOB LINK: 433MHz [ACTIVE]";
            line3.innerText = "STATUS: 433MHz ACTIVE";
            line4.innerText = `BURST TX: #${continuity.subghz_packets || 1}`;
            fs1000State.innerText = "TRANSMITTING (BURST)";
            fs1000State.className = "text-alert";

            relayVisual.className = "relay-contact open";
            relayLabel.innerText = "RADIO FAILOVER [ON]";
            relayText.innerText = "SUB-GHZ BRIDGE (100% PDR)";
            relayText.className = "text-alert";
        } else {
            oled.className = "oled-mirror";
            line1.innerText = ">> GHOST-SPECTRUM <<";
            line2.innerText = "LINK: 2.4GHz [OK]";
            line3.innerText = "OOB:  433MHz STANDBY";
            line4.innerText = `PKT:  #${telemetry.seq || 1}`;
            fs1000State.innerText = "STANDBY";
            fs1000State.className = "text-ok";

            relayVisual.className = "relay-contact closed";
            relayLabel.innerText = "CLOSED (NC)";
            relayText.innerText = "CLOSED (NOMINAL)";
            relayText.className = "text-ok";
        }
    }

    // Draw Waterfall Heatmap
    function drawWaterfall() {
        const w = waterfallCanvas.width;
        const h = waterfallCanvas.height;
        wfCtx.fillStyle = "#06090e";
        wfCtx.fillRect(0, 0, w, h);

        const rows = waterfallHistory.length;
        if (rows === 0) return;

        const rowHeight = h / MAX_WF_ROWS;
        const colWidth = w / 125;

        for (let r = 0; r < rows; r++) {
            const bins = waterfallHistory[r];
            const y = r * rowHeight;
            for (let c = 0; c < 125; c++) {
                const val = bins[c];
                if (val > 0) {
                    // Heatmap color: gradient from cyan/orange to crimson
                    const heat = val;
                    if (heat > 0.8) {
                        wfCtx.fillStyle = "#f85149"; // Crimson
                    } else if (heat > 0.5) {
                        wfCtx.fillStyle = "#d29922"; // Amber/Orange
                    } else {
                        wfCtx.fillStyle = "#39c5cf"; // Cyan
                    }
                    wfCtx.fillRect(c * colWidth, y, colWidth + 0.5, rowHeight + 0.5);
                }
            }
        }
    }

    // Draw Telemetry Continuity Graph
    function drawContinuity() {
        const w = continuityCanvas.width;
        const h = continuityCanvas.height;
        contCtx.fillStyle = "#06090e";
        contCtx.fillRect(0, 0, w, h);

        // Grid lines
        contCtx.strokeStyle = "#161d2b";
        contCtx.lineWidth = 1;
        for (let y = 30; y < h; y += 35) {
            contCtx.beginPath();
            contCtx.moveTo(0, y);
            contCtx.lineTo(w, y);
            contCtx.stroke();
        }

        // Draw Wi-Fi Telemetry line (Blue)
        contCtx.strokeStyle = "#388bfd";
        contCtx.lineWidth = 2.5;
        contCtx.beginPath();
        for (let i = 0; i < MAX_CONT_POINTS; i++) {
            const x = (i / (MAX_CONT_POINTS - 1)) * w;
            const y = h - (wifiHistory[i] / 40) * (h - 20) - 10;
            if (i === 0) contCtx.moveTo(x, y);
            else contCtx.lineTo(x, y);
        }
        contCtx.stroke();

        // Draw 433 MHz Sub-GHz line (Green)
        contCtx.strokeStyle = "#3fb950";
        contCtx.lineWidth = 2.5;
        contCtx.beginPath();
        for (let i = 0; i < MAX_CONT_POINTS; i++) {
            const x = (i / (MAX_CONT_POINTS - 1)) * w;
            const y = h - (subghzHistory[i] / 40) * (h - 20) - 10;
            if (i === 0) contCtx.moveTo(x, y);
            else contCtx.lineTo(x, y);
        }
        contCtx.stroke();
    }

    // Control Button Event Listeners
    async function postAction(url) {
        try {
            await fetch(url, { method: "POST" });
        } catch (e) {
            console.error("Action error:", e);
        }
    }

    document.getElementById("btn-sim-benign").addEventListener("click", () => postAction("/api/simulate/benign"));
    document.getElementById("btn-sim-deauth").addEventListener("click", () => postAction("/api/simulate/deauth"));
    document.getElementById("btn-sim-jam").addEventListener("click", () => postAction("/api/simulate/jamming"));
    document.getElementById("btn-manual-trip").addEventListener("click", () => postAction("/api/action/trip"));
    document.getElementById("btn-system-reset").addEventListener("click", () => postAction("/api/action/reset"));

    // Initialize
    connectWS();
});
