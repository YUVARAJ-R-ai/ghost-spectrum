import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Billboard, RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { useHub, useUi, type NodeId } from "../lib/store";
import { COLOR, clamp, lerp } from "../lib/format";
import { NODE_SCALE, POS, S, easeOutBack, introAt } from "./world";
import { drawLaptop, drawPhone, makeCanvasTexture } from "./textures";
import Ripples from "./Ripples";

const hexToVec = (h: string) => new THREE.Color(h);
const AMBER = hexToVec(COLOR.radio), RED = hexToVec(COLOR.bad), BLUE = hexToVec(COLOR.wifi);

/** Entrance: nodes pop in one after another with a little overshoot. */
function useEntrance(ref: React.RefObject<THREE.Object3D | null>, delay: number) {
  useFrame(() => {
    const o = ref.current; if (!o) return;
    const k = easeOutBack(introAt(delay, 1));
    o.scale.setScalar(Math.max(0.0001, k) * NODE_SCALE * (S.hover === (o.userData.id ?? "") ? 1.035 : 1));
  });
}

/** Invisible click target so a whole node (not just its thin parts) can be hovered and selected. */
function Hit({ id, r = 1.3, y = 0.7 }: { id: NodeId; r?: number; y?: number }) {
  const setFocus = useUi((s) => s.setFocus);
  return (
    <mesh position={[0, y, 0]} onClick={(e) => { e.stopPropagation(); setFocus(id); }}
      onPointerOver={(e) => { e.stopPropagation(); S.hover = id; document.body.style.cursor = "pointer"; }}
      onPointerOut={() => { S.hover = ""; document.body.style.cursor = ""; }}>
      <sphereGeometry args={[r, 16, 12]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

/** Little surface-mount parts and header pins so a board reads as electronics, not a slab. Positions are x, z, width, depth, height. */
function Smd({ y, parts, pins }: { y: number; parts: [number, number, number, number, number][]; pins?: { x: number; z: number; len: number }[] }) {
  return (
    <group position-y={y}>
      {parts.map(([x, z, w, d, h], i) => (
        <mesh key={i} position={[x, h / 2, z]}><boxGeometry args={[w, h, d]} /><meshStandardMaterial color={i % 3 === 0 ? "#cdb98a" : "#1a1b22"} roughness={0.45} metalness={i % 3 === 0 ? 0.9 : 0.2} /></mesh>
      ))}
      {pins?.map((p, i) => (
        <mesh key={`p${i}`} position={[p.x, 0.035, p.z]}><boxGeometry args={[p.len, 0.07, 0.07]} /><meshStandardMaterial color="#e0c27a" metalness={1} roughness={0.25} emissive="#3a2a08" /></mesh>
      ))}
    </group>
  );
}

const glassPlinth = { color: "#0b0d14", roughness: 0.15, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.1 } as const;

function Plinth({ r = 1.25, h = 0.14 }: { r?: number; h?: number }) {
  const ring = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(() => { ring.current.color.copy(S.accent); });
  return (
    <group>
      <mesh position-y={h / 2}><cylinderGeometry args={[r, r * 1.05, h, 64]} /><meshPhysicalMaterial {...glassPlinth} /></mesh>
      <mesh position-y={h + 0.002} rotation-x={-Math.PI / 2}><ringGeometry args={[r * 0.86, r * 0.89, 96]} /><meshBasicMaterial ref={ring} transparent opacity={0.55} toneMapped={false} /></mesh>
    </group>
  );
}

// ---------------------------------------------------------------- Node A
export function NodeA() {
  const g = useRef<THREE.Group>(null!);
  const body = useRef<THREE.Group>(null!);
  const led = useRef<THREE.MeshBasicMaterial>(null!);
  const bead = useRef<THREE.MeshBasicMaterial>(null!);
  const ir = useRef<THREE.MeshBasicMaterial>(null!);
  const bars = useRef<THREE.InstancedMesh>(null!);
  const N = 18;
  const tmp = useMemo(() => new THREE.Object3D(), []);
  const col = useMemo(() => new THREE.Color(), []);
  useEntrance(g, 0.5);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    body.current.position.y = 0.16 + Math.sin(t * 1.3) * 0.035;
    body.current.rotation.y = Math.sin(t * 0.4) * 0.05;
    led.current.color.copy(S.radio > 0.5 ? AMBER : S.wifiUp > 0.5 ? BLUE : RED).multiplyScalar(S.online ? 1.8 + Math.sin(t * 6) * 0.5 : 0.25);
    bead.current.color.copy(AMBER).multiplyScalar(0.25 + S.radio * 3.2 + Math.max(0, Math.sin(t * 8)) * S.radio);
    ir.current.color.setRGB(1, 0.15, 0.15).multiplyScalar(0.6 + S.sensor * 3);
    // sensor history as a tiny 3D bar chart
    const pts = useHub.getState().sensors.slice(-N);
    for (let i = 0; i < N; i++) {
      const p = pts[pts.length - N + i];
      const h = p ? 0.06 + (p.v / 4095) * 0.5 : 0.02;
      tmp.position.set(-0.72 + i * 0.085, 1.52 + h / 2 - 0.34, 0); tmp.scale.set(1, h, 1); tmp.updateMatrix();
      bars.current.setMatrixAt(i, tmp.matrix);
      col.set(p ? (p.path === "wifi" ? COLOR.wifi : p.path === "radio" ? COLOR.radio : COLOR.both) : "#222");
      bars.current.setColorAt(i, col.multiplyScalar(p ? 1.05 : 0.25));
    }
    bars.current.instanceMatrix.needsUpdate = true;
    if (bars.current.instanceColor) bars.current.instanceColor.needsUpdate = true;
  });

  return (
    <group ref={g} position={POS.A} userData={{ id: "A" }}>
      <Plinth />
      <group ref={body} position-y={0.16}>
        <RoundedBox args={[1.7, 0.09, 1.05]} radius={0.03} smoothness={3} position-y={0.24}>
          <meshPhysicalMaterial color="#12473d" emissive="#04261e" emissiveIntensity={0.9} roughness={0.38} metalness={0.3} clearcoat={0.8} clearcoatRoughness={0.2} />
        </RoundedBox>
        <RoundedBox args={[0.64, 0.08, 0.4]} radius={0.015} smoothness={2} position={[-0.32, 0.33, 0.05]}>
          <meshStandardMaterial color="#b9c0cc" roughness={0.28} metalness={0.95} />
        </RoundedBox>
        <mesh position={[-0.32, 0.375, 0.05]}><boxGeometry args={[0.44, 0.012, 0.2]} /><meshStandardMaterial color="#0a0a0f" roughness={0.5} /></mesh>
        <RoundedBox args={[0.34, 0.05, 0.3]} radius={0.01} position={[0.5, 0.31, -0.2]}><meshStandardMaterial color="#1c4fd0" roughness={0.5} metalness={0.2} /></RoundedBox>
        <mesh position={[0.6, 0.38, -0.12]}><sphereGeometry args={[0.05, 12, 8]} /><meshBasicMaterial ref={ir} toneMapped={false} /></mesh>
        <mesh position={[0.42, 0.37, -0.12]}><sphereGeometry args={[0.05, 12, 8]} /><meshPhysicalMaterial color="#222" roughness={0.1} metalness={0.2} clearcoat={1} /></mesh>
        <mesh position={[0.5, 0.33, 0.3]}><cylinderGeometry args={[0.13, 0.13, 0.1, 24]} /><meshStandardMaterial color="#0b0b0e" roughness={0.4} /></mesh>
        <mesh position={[0.02, 0.3, 0.4]}><sphereGeometry args={[0.04, 12, 8]} /><meshBasicMaterial ref={led} toneMapped={false} /></mesh>
        <Smd y={0.285} parts={[[-0.7, 0.3, 0.09, 0.05, 0.03], [-0.62, 0.36, 0.05, 0.05, 0.03], [-0.05, -0.32, 0.12, 0.08, 0.05], [0.12, -0.38, 0.05, 0.05, 0.03], [0.2, 0.18, 0.08, 0.06, 0.04], [-0.55, -0.28, 0.1, 0.06, 0.03]]}
          pins={[{ x: -0.32, z: 0.46, len: 0.6 }, { x: -0.32, z: -0.4, len: 0.6 }]} />
        {/* the 17.3 cm antenna wire on the 433 MHz transmitter */}
        <mesh position={[-0.7, 0.8, -0.32]}><cylinderGeometry args={[0.011, 0.011, 1.0, 8]} /><meshStandardMaterial color="#c8c2b0" metalness={0.9} roughness={0.3} /></mesh>
        <mesh position={[-0.7, 1.31, -0.32]}><sphereGeometry args={[0.05, 12, 8]} /><meshBasicMaterial ref={bead} toneMapped={false} /></mesh>
        {/* hologram: last 18 sensor readings, each bar coloured by the path that delivered it */}
        <mesh position={[0, 1.3 + 0.0, 0]}><planeGeometry args={[1.7, 0.02]} /><meshBasicMaterial color="#6cb8ff" transparent opacity={0.25} toneMapped={false} /></mesh>
        <instancedMesh ref={bars} args={[undefined, undefined, N]} frustumCulled={false}>
          <boxGeometry args={[0.055, 1, 0.055]} /><meshBasicMaterial toneMapped={false} />
        </instancedMesh>
      </group>
      <Ripples position={[-0.7, 0, -0.3]} color={() => AMBER} power={() => S.radio * 0.9} maxR={2.6} rate={0.5} />
      <pointLight position={[0, 1, 0.8]} intensity={1.2} distance={5} color={BLUE} />
      <Hit id="A" r={1.35} y={0.8} />
    </group>
  );
}

// ---------------------------------------------------------------- Router (phone hotspot)
export function Hotspot() {
  const g = useRef<THREE.Group>(null!);
  const arcs = useRef<THREE.MeshBasicMaterial[]>([]);
  const dotMat = useRef<THREE.MeshBasicMaterial>(null!);
  const slash = useRef<THREE.Mesh>(null!);
  const lock = useRef<THREE.Group>(null!);
  const swarm = useRef<THREE.Points>(null!);
  const { c, ctx, tex } = useMemo(() => { const m = makeCanvasTexture(256, 512); return { c: m.canvas, ctx: m.ctx, tex: m.tex }; }, []);
  const sig = useRef("");
  const tmp = useMemo(() => new THREE.Color(), []);
  useEntrance(g, 0.2);

  const swarmData = useMemo(() => {
    const n = 140, pos = new Float32Array(n * 3), seed = new Float32Array(n * 3);
    for (let i = 0; i < n * 3; i++) seed[i] = Math.random() * Math.PI * 2;
    return { n, pos, seed };
  }, []);

  useEffect(() => { void document.fonts?.load('600 30px "Geist Variable"'); }, []);
  void c;

  useFrame(({ clock }, dt) => {
    const t = clock.elapsedTime;
    const s = S.strength, up = S.wifiUp;
    // wifi glyph arcs light up by signal strength
    [0.12, 0.38, 0.64].forEach((th, i) => {
      const k = clamp((s - th) / 0.2, 0, 1) * up;
      const m = arcs.current[i]; if (!m) return;
      tmp.copy(S.auth > 0.5 || (up < 0.3 && S.online > 0.5) ? RED : BLUE).lerp(S.accent, 0.0);
      m.color.copy(tmp).multiplyScalar(0.3 + k * 2.6);
      m.opacity = 0.35 + k * 0.65;
    });
    dotMat.current.color.copy(S.auth > 0.5 || up < 0.3 ? RED : BLUE).multiplyScalar(S.online > 0.5 ? 2.5 : 0.3);
    slash.current.visible = up < 0.3 && S.online > 0.5 && S.auth < 0.5;
    slash.current.scale.setScalar(lerp(slash.current.scale.x, slash.current.visible ? 1 : 0.01, 1 - Math.exp(-10 * dt)));
    lock.current.scale.setScalar(lerp(lock.current.scale.x, S.auth > 0.5 ? 1 : 0.001, 1 - Math.exp(-9 * dt)));
    // screen texture only redraws when the picture would change
    const level = up < 0.3 ? 0 : s > 0.7 ? 3 : s > 0.4 ? 2 : s > 0.12 ? 1 : 0;
    const mode = S.auth > 0.5 ? "auth" : up < 0.3 && S.online > 0.5 ? "down" : "ok";
    const rssi = useHub.getState().snap?.features.rssi_now;
    const key = `${level}${mode}${rssi === undefined ? "" : Math.round(rssi / 2)}`;
    if (key !== sig.current) { sig.current = key; drawPhone(ctx, 256, 512, level, mode as "ok" | "down" | "auth", rssi ?? null); tex.needsUpdate = true; }
    // congestion: a swarm of orange motes jittering around the phone
    const sw = swarm.current, mat = sw.material as THREE.PointsMaterial;
    mat.opacity = S.congest * 0.9; sw.visible = S.congest > 0.02;
    if (sw.visible) {
      const { n, pos, seed } = swarmData;
      for (let i = 0; i < n; i++) {
        const a = seed[i * 3] + t * (0.8 + (seed[i * 3 + 1] % 1.5)), b = seed[i * 3 + 1] + t * 1.3;
        const r = 0.9 + 0.7 * Math.abs(Math.sin(seed[i * 3 + 2] + t * 2.4));
        pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 1.1 + Math.sin(b) * 0.9; pos[i * 3 + 2] = Math.sin(a) * r;
      }
      sw.geometry.attributes.position.needsUpdate = true;
    }
  });

  const arcRadii = [0.28, 0.5, 0.72];
  return (
    <group ref={g} position={POS.hotspot} userData={{ id: "hotspot" }}>
      <mesh position-y={0.03}><cylinderGeometry args={[0.5, 0.55, 0.06, 48]} /><meshPhysicalMaterial {...glassPlinth} /></mesh>
      <group position-y={0.78} rotation-x={-0.1}>
        <RoundedBox args={[0.8, 1.45, 0.09]} radius={0.09} smoothness={4}><meshPhysicalMaterial color="#0d0f16" roughness={0.25} metalness={0.9} clearcoat={0.8} /></RoundedBox>
        <mesh position-z={0.048}><planeGeometry args={[0.7, 1.35]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
      </group>
      {/* floating Wi-Fi glyph: arcs light with signal strength, a slash when the router is gone, a padlock when it rejects us */}
      <Billboard position={[0, 2.55, 0]}>
        {arcRadii.map((r, i) => (
          <mesh key={i} rotation-z={Math.PI / 4}>
            <torusGeometry args={[r, 0.04, 10, 48, Math.PI / 2]} />
            <meshBasicMaterial ref={(m) => { if (m) arcs.current[i] = m; }} transparent toneMapped={false} />
          </mesh>
        ))}
        <mesh position-y={-0.04}><sphereGeometry args={[0.06, 16, 12]} /><meshBasicMaterial ref={dotMat} toneMapped={false} /></mesh>
        <mesh ref={slash} position={[0, 0.3, 0.02]} rotation-z={-Math.PI / 4}><boxGeometry args={[1.25, 0.06, 0.02]} /><meshBasicMaterial color={[3, 0.3, 0.4]} toneMapped={false} /></mesh>
        <group ref={lock} position={[0.95, 0.2, 0]} scale={0.001}>
          <RoundedBox args={[0.36, 0.28, 0.1]} radius={0.04}><meshBasicMaterial color={[2.6, 0.25, 0.4]} toneMapped={false} /></RoundedBox>
          <mesh position-y={0.2}><torusGeometry args={[0.12, 0.035, 8, 24, Math.PI]} /><meshBasicMaterial color={[2.6, 0.25, 0.4]} toneMapped={false} /></mesh>
        </group>
      </Billboard>
      <points ref={swarm} frustumCulled={false}>
        <bufferGeometry><bufferAttribute attach="attributes-position" args={[swarmData.pos, 3]} /></bufferGeometry>
        <pointsMaterial color="#ff8a4c" size={0.07} transparent depthWrite={false} toneMapped={false} sizeAttenuation />
      </points>
      <Ripples position={[0, 0, 0]} color={() => (S.strength < 0.25 ? RED : BLUE)} power={() => S.wifiUp * (0.25 + S.strength * 0.75)} maxR={1.2 + 3.6 * S.strength} minR={0.6} rate={0.28} count={4} />
      <pointLight position={[0, 1.4, 1]} intensity={1.1} distance={6} color={BLUE} />
      <Hit id="hotspot" r={1.2} y={1.2} />
    </group>
  );
}

// ---------------------------------------------------------------- Laptop hub
export function Laptop() {
  const g = useRef<THREE.Group>(null!);
  const glow = useRef<THREE.PointLight>(null!);
  const { ctx, tex } = useMemo(() => { const m = makeCanvasTexture(640, 400); return { ctx: m.ctx, tex: m.tex }; }, []);
  const last = useRef(0);
  const keys = useMemo(() => {
    // a drawn keyboard: five rows of backlit keys
    const { ctx: c, tex } = makeCanvasTexture(640, 256);
    c.fillStyle = "#07080d"; c.fillRect(0, 0, 640, 256);
    const rows = [14, 14, 13, 12, 8];
    rows.forEach((n, r) => {
      const w = 640 / (n + 0.5), y = 8 + r * 48;
      for (let i = 0; i < n; i++) {
        const x = 6 + i * w + (r % 2 ? w * 0.25 : 0);
        c.fillStyle = "#171a26"; c.beginPath(); c.roundRect(x, y, w - 6, 40, 6); c.fill();
        c.fillStyle = "rgba(120,170,255,.16)"; c.fillRect(x + 4, y + 3, w - 14, 2);
      }
    });
    tex.needsUpdate = true;
    return tex;
  }, []);
  useEntrance(g, 0.8);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    if (t - last.current > 0.18) { last.current = t; drawLaptop(ctx, 640, 400, t); tex.needsUpdate = true; }
    glow.current.color.copy(S.accent);
    glow.current.intensity = 1.4 + S.lostFlash * 6;
  });

  return (
    <group ref={g} position={POS.laptop} rotation-y={-0.42} userData={{ id: "laptop" }}>
      <Plinth r={1.5} />
      <group position-y={0.14}>
        <RoundedBox args={[2.0, 0.07, 1.3]} radius={0.03} smoothness={3} position-y={0.04}><meshStandardMaterial color="#c9cdd8" roughness={0.3} metalness={0.95} /></RoundedBox>
        <mesh position={[0, 0.082, 0.1]}><boxGeometry args={[1.76, 0.008, 0.7]} /><meshStandardMaterial color="#0d0e14" roughness={0.6} /></mesh>
        <mesh position={[0, 0.0875, 0.1]} rotation-x={-Math.PI / 2}><planeGeometry args={[1.7, 0.56]} /><meshBasicMaterial map={keys} toneMapped={false} /></mesh>
        <RoundedBox args={[0.55, 0.008, 0.32]} radius={0.02} position={[0, 0.082, 0.62]}><meshStandardMaterial color="#b9bdc9" roughness={0.3} metalness={0.9} /></RoundedBox>
        <group position={[0, 0.07, -0.62]} rotation-x={-0.22}>
          <RoundedBox args={[2.0, 1.28, 0.05]} radius={0.035} smoothness={3} position-y={0.64}><meshStandardMaterial color="#aab0be" roughness={0.3} metalness={0.95} /></RoundedBox>
          <mesh position={[0, 0.64, 0.03]}><planeGeometry args={[1.88, 1.17]} /><meshBasicMaterial map={tex} toneMapped={false} /></mesh>
        </group>
      </group>
      <pointLight ref={glow} position={[0, 1.2, 0.9]} distance={5} />
      <Hit id="laptop" r={1.5} y={0.9} />
    </group>
  );
}

// ---------------------------------------------------------------- Node B (433 MHz gateway)
export function Gateway() {
  const g = useRef<THREE.Group>(null!);
  const relayLed = useRef<THREE.MeshBasicMaterial>(null!);
  const bead = useRef<THREE.MeshBasicMaterial>(null!);
  const relay = useRef<THREE.Mesh>(null!);
  useEntrance(g, 0.65);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    relayLed.current.color.copy(AMBER).multiplyScalar(0.12 + S.relay * 4);
    bead.current.color.copy(AMBER).multiplyScalar(0.3 + S.radio * 3 + Math.max(0, Math.sin(t * 9)) * S.radio);
    relay.current.position.y = 0.36 + (S.relay > 0.5 ? Math.sin(t * 40) * 0.003 * Math.max(0, 1 - ((t * 0.5) % 1) * 6) : 0);
  });
  return (
    <group ref={g} position={POS.gateway} userData={{ id: "gateway" }}>
      <Plinth r={1.15} />
      <group position-y={0.14}>
        <RoundedBox args={[1.5, 0.08, 0.9]} radius={0.03} smoothness={3} position-y={0.04}><meshPhysicalMaterial color="#12406a" emissive="#041b33" emissiveIntensity={0.9} roughness={0.4} metalness={0.3} clearcoat={0.7} /></RoundedBox>
        <RoundedBox args={[0.55, 0.07, 0.36]} radius={0.015} position={[-0.45, 0.12, 0.15]}><meshStandardMaterial color="#b9c0cc" roughness={0.28} metalness={0.95} /></RoundedBox>
        <RoundedBox args={[0.46, 0.05, 0.34]} radius={0.01} position={[0.05, 0.11, -0.2]}><meshStandardMaterial color="#0b4a35" roughness={0.45} metalness={0.2} /></RoundedBox>
        <mesh position={[0.05, 0.16, -0.2]}><cylinderGeometry args={[0.04, 0.04, 0.05, 12]} /><meshStandardMaterial color="#c8c8c8" metalness={1} roughness={0.2} /></mesh>
        <Smd y={0.08} parts={[[-0.6, -0.3, 0.08, 0.06, 0.04], [-0.1, 0.3, 0.1, 0.06, 0.04], [0.2, -0.05, 0.06, 0.06, 0.03], [-0.3, -0.34, 0.05, 0.05, 0.03]]}
          pins={[{ x: -0.45, z: 0.4, len: 0.5 }, { x: -0.45, z: -0.05, len: 0.5 }]} />
        <mesh ref={relay} position={[0.5, 0.36, 0.1]}><boxGeometry args={[0.42, 0.34, 0.34]} /><meshPhysicalMaterial color="#1c4fe0" roughness={0.35} clearcoat={0.5} /></mesh>
        <mesh position={[0.5, 0.2, 0.3]}><sphereGeometry args={[0.04, 12, 8]} /><meshBasicMaterial ref={relayLed} toneMapped={false} /></mesh>
        <mesh position={[0.05, 0.62, -0.2]}><cylinderGeometry args={[0.011, 0.011, 1.0, 8]} /><meshStandardMaterial color="#c8c2b0" metalness={0.9} roughness={0.3} /></mesh>
        <mesh position={[0.05, 1.13, -0.2]}><sphereGeometry args={[0.05, 12, 8]} /><meshBasicMaterial ref={bead} toneMapped={false} /></mesh>
      </group>
      <Ripples position={[0.05, 0, -0.2]} color={() => AMBER} power={() => S.radio * 0.5} maxR={1.8} rate={0.45} count={3} />
      <pointLight position={[0.5, 0.8, 0.5]} intensity={0.8 + 0} distance={4} color={AMBER} />
      <Hit id="gateway" r={1.15} y={0.6} />
    </group>
  );
}

// ---------------------------------------------------------------- Node C (air watcher)
export function AirWatcher() {
  const g = useRef<THREE.Group>(null!);
  const sweep = useRef<THREE.Mesh>(null!);
  const sweepMat = useRef<THREE.MeshBasicMaterial>(null!);
  const tmp = useMemo(() => new THREE.Color(), []);
  useEntrance(g, 1.0);
  useFrame(({ clock }, dt) => {
    sweep.current.rotation.z -= dt * (1.2 + S.deauth * 4);
    tmp.copy(BLUE).lerp(RED, S.deauth);
    sweepMat.current.color.copy(tmp).multiplyScalar(1.2);
    sweepMat.current.opacity = 0.07 + S.deauth * 0.16;
    g.current.position.x = POS.air.x + (S.deauth > 0.3 ? Math.sin(clock.elapsedTime * 55) * 0.012 : 0);
  });
  return (
    <group ref={g} position={POS.air} userData={{ id: "air" }}>
      <mesh position-y={0.05}><cylinderGeometry args={[0.7, 0.75, 0.1, 40]} /><meshPhysicalMaterial {...glassPlinth} /></mesh>
      <RoundedBox args={[0.8, 0.06, 0.5]} radius={0.02} position-y={0.17}><meshStandardMaterial color="#12141c" roughness={0.4} metalness={0.5} /></RoundedBox>
      <mesh position={[-0.2, 0.22, 0]}><boxGeometry args={[0.34, 0.05, 0.22]} /><meshStandardMaterial color="#b9c0cc" metalness={0.95} roughness={0.28} /></mesh>
      <mesh position={[0.28, 0.5, 0]}><cylinderGeometry args={[0.01, 0.01, 0.62, 8]} /><meshStandardMaterial color="#c8c2b0" metalness={0.9} roughness={0.3} /></mesh>
      <mesh ref={sweep} rotation-x={-Math.PI / 2} position-y={0.03}>
        <circleGeometry args={[1.9, 40, 0, 0.6]} /><meshBasicMaterial ref={sweepMat} transparent depthWrite={false} toneMapped={false} side={THREE.DoubleSide} />
      </mesh>
      <Ripples position={[0, 0, 0]} color={() => RED} power={() => S.deauth} maxR={3.8} rate={1.1} count={5} />
      <Ripples position={[0, 0, 0]} color={() => BLUE} power={() => 0.35 * S.online} maxR={2.2} rate={0.3} count={2} />
      <Hit id="air" r={0.9} y={0.4} />
    </group>
  );
}
