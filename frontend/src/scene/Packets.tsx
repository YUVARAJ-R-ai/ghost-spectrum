import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { eventQueue } from "../lib/store";
import { COLOR } from "../lib/format";
import { POS, RADIO_SPLIT, S, pointAt, radioPts, wifiPts } from "./world";

const N = 64, TRAIL = 14, SPARKS = 160;
const WIFI = new THREE.Color(COLOR.wifi), RADIO = new THREE.Color(COLOR.radio), RED = new THREE.Color(COLOR.bad), ACK = new THREE.Color("#d9e6ff");

interface Packet { alive: boolean; u: number; speed: number; route: 0 | 1; ack: boolean; die: number; color: THREE.Color; size: number; split: boolean }

/**
 * Every reading the hub receives becomes a glowing bead that flies along the route that carried it:
 * blue over Wi-Fi, amber over radio. Wi-Fi beads come back as a pale acknowledgement; a lost reading
 * turns red, stalls and bursts into sparks. This is the hub's data made visible.
 */
export default function Packets() {
  const mesh = useRef<THREE.InstancedMesh>(null!);
  const sparkMesh = useRef<THREE.InstancedMesh>(null!);
  const pool = useMemo<Packet[]>(() => Array.from({ length: N }, () => ({ alive: false, u: 0, speed: 0.5, route: 0, ack: false, die: 2, color: WIFI.clone(), size: 0.08, split: false })), []);
  const sp = useMemo(() => ({
    pos: Array.from({ length: SPARKS }, () => new THREE.Vector3()), vel: Array.from({ length: SPARKS }, () => new THREE.Vector3()),
    life: new Float32Array(SPARKS), color: Array.from({ length: SPARKS }, () => new THREE.Color()), size: new Float32Array(SPARKS), next: 0,
  }), []);
  const o = useMemo(() => new THREE.Object3D(), []);
  const v = useMemo(() => new THREE.Vector3(), []);
  const c = useMemo(() => new THREE.Color(), []);

  const burst = (p: THREE.Vector3, color: THREE.Color, n: number, speed: number, size = 0.05) => {
    for (let i = 0; i < n; i++) {
      const k = sp.next++ % SPARKS;
      sp.pos[k].copy(p);
      sp.vel[k].set((Math.random() - 0.5) * speed, Math.random() * speed * 0.9, (Math.random() - 0.5) * speed);
      sp.life[k] = 0.6 + Math.random() * 0.6; sp.color[k].copy(color); sp.size[k] = size * (0.6 + Math.random());
    }
  };
  const spawn = (route: 0 | 1, color: THREE.Color, opts: Partial<Packet> = {}) => {
    const p = pool.find((q) => !q.alive); if (!p) return;
    Object.assign(p, { alive: true, u: 0, route, ack: false, die: 2, size: 0.07, split: false, speed: route === 0 ? 1 / 1.9 : 1 / 2.7 }, opts);
    p.color.copy(color);
  };

  useFrame((_, dtRaw) => {
    const dt = Math.min(dtRaw, 0.05);
    // 1) new readings from the hub become beads
    const now = performance.now();
    let spawned = 0;
    while (eventQueue.length && spawned < 6) {
      const ev = eventQueue.shift()!;
      if (now - ev.at > 2500) continue;
      spawned++;
      if (ev.kind === "lost") { spawn(0, RED, { die: 0.28 + Math.random() * 0.2, size: 0.1 }); S.lostFlash = 1; }
      else if (ev.path === "wifi") spawn(0, WIFI);
      else if (ev.path === "radio") spawn(1, RADIO);
      else { spawn(0, WIFI); spawn(1, RADIO); }
    }

    // 2) advance every bead
    let idx = 0;
    const m = mesh.current;
    for (const p of pool) {
      if (!p.alive) continue;
      const stall = p.route === 0 && !p.ack ? 1 - 0.55 * S.congest : 1;
      p.u += (p.ack ? -1 : 1) * p.speed * (p.ack ? 1.9 : 1) * stall * dt;
      if (!p.ack && p.u >= p.die) {          // lost: burst where it died
        pointAt(p.route === 0 ? wifiPts : radioPts, p.u, v); burst(v, RED, 16, 3.2, 0.06); p.alive = false; continue;
      }
      if (p.route === 1 && !p.split && p.u >= RADIO_SPLIT) { p.split = true; burst(POS.gateway.clone().setY(1.0), RADIO, 10, 1.6); }
      if (!p.ack && p.u >= 1) {              // arrived at the laptop
        pointAt(p.route === 0 ? wifiPts : radioPts, 1, v); burst(v, p.route === 0 ? WIFI : RADIO, 9, 1.8);
        if (p.route === 0) { p.ack = true; p.color.copy(ACK); p.size = 0.05; p.u = 1; } else p.alive = false;
        continue;
      }
      if (p.ack && p.u <= 0) { p.alive = false; continue; }
      const table = p.route === 0 ? wifiPts : radioPts;
      const fade = p.ack ? 0.45 : 1;
      for (let k = 0; k < TRAIL && idx < N * TRAIL; k++, idx++) {
        const u = p.u - (p.ack ? -1 : 1) * k * 0.0085;
        pointAt(table, u, v);
        const f = 1 - k / TRAIL;
        o.position.copy(v); o.scale.setScalar(p.size * (0.35 + 0.65 * f) * (p.die < 2 ? 1 + Math.sin(performance.now() * 0.04) * 0.15 : 1)); o.updateMatrix();
        m.setMatrixAt(idx, o.matrix);
        m.setColorAt(idx, c.copy(p.color).multiplyScalar(f * f * 3.4 * fade));
      }
    }
    for (; idx < N * TRAIL; idx++) { o.scale.setScalar(0.0001); o.updateMatrix(); m.setMatrixAt(idx, o.matrix); }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;

    // 3) sparks
    const sm = sparkMesh.current;
    for (let i = 0; i < SPARKS; i++) {
      if (sp.life[i] > 0) {
        sp.life[i] -= dt;
        sp.vel[i].y -= 3.2 * dt; sp.vel[i].multiplyScalar(1 - 1.4 * dt);
        sp.pos[i].addScaledVector(sp.vel[i], dt);
        if (sp.pos[i].y < 0.02) { sp.pos[i].y = 0.02; sp.vel[i].y *= -0.3; }
      }
      const l = Math.max(0, sp.life[i]);
      o.position.copy(sp.pos[i]); o.scale.setScalar(Math.max(0.0001, sp.size[i] * l * 1.6)); o.updateMatrix();
      sm.setMatrixAt(i, o.matrix);
      sm.setColorAt(i, c.copy(sp.color[i]).multiplyScalar(Math.min(1, l) * 3));
    }
    sm.instanceMatrix.needsUpdate = true;
    if (sm.instanceColor) sm.instanceColor.needsUpdate = true;
  });

  return (
    <>
      <instancedMesh ref={mesh} args={[undefined, undefined, N * TRAIL]} frustumCulled={false}>
        <sphereGeometry args={[1, 10, 8]} /><meshBasicMaterial toneMapped={false} blending={THREE.AdditiveBlending} transparent depthWrite={false} />
      </instancedMesh>
      <instancedMesh ref={sparkMesh} args={[undefined, undefined, SPARKS]} frustumCulled={false}>
        <sphereGeometry args={[1, 6, 5]} /><meshBasicMaterial toneMapped={false} blending={THREE.AdditiveBlending} transparent depthWrite={false} />
      </instancedMesh>
    </>
  );
}
