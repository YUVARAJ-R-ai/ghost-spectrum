import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useHub } from "../lib/store";
import { deriveLink } from "../lib/linkState";
import { damp, signalStrength } from "../lib/format";
import { S } from "./world";

const target = new THREE.Color();

/** Eases the shared scene state toward the latest snapshot. Runs first, every frame. */
export default function StateDriver() {
  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.1);
    S.intro += dt;
    const snap = useHub.getState().snap;
    const link = deriveLink(snap);
    const f = snap?.features ?? {};
    const online = snap?.node.online ? 1 : 0;
    const connected = (f.connected_frac ?? 1) > 0.5 && (snap?.wifi_age ?? 99) < 2.5 ? 1 : 0;
    const radio = snap?.node.mode === "radio" ? 1 : 0;

    S.hasData = damp(S.hasData, snap ? 1 : 0, 3, dt);
    S.gw = damp(S.gw, snap?.gateway.online ? 1 : 0, 4, dt);
    S.airOn = damp(S.airOn, snap?.sentinel.online ? 1 : 0, 4, dt);
    S.online = damp(S.online, online, 4, dt);
    S.strength = damp(S.strength, online ? (connected ? signalStrength(f.rssi_now) : 0) : 0, 3.5, dt);
    S.wifiUp = damp(S.wifiUp, online * connected, 5, dt);
    S.radio = damp(S.radio, online * radio, 5, dt);
    S.handover = damp(S.handover, online * radio * connected, 5, dt);
    S.auth = damp(S.auth, snap?.held === "auth_fail" || snap?.alert === "auth" ? 1 : 0, 4, dt);
    S.deauth = damp(S.deauth, (snap?.air.deauth_per_s ?? 0) > 20 ? 1 : 0, 4, dt);
    S.congest = damp(S.congest, snap?.held === "congestion" ? 1 : 0, 3, dt);
    S.relay = damp(S.relay, snap?.gateway.relay ? 1 : radio ? 1 : 0, 10, dt);
    S.lostFlash = damp(S.lostFlash, 0, 2.2, dt);
    const last = snap?.readings.length ? snap.readings.reduce((a, b) => (b[0] > a[0] ? b : a)) : null;
    if (last) S.sensor = damp(S.sensor, last[2] / 4095, 6, dt);

    target.set(link.color);
    S.accent.lerp(target, 1 - Math.exp(-3 * dt));
  }, -2);
  return null;
}
