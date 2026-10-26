import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useHub } from "../lib/store";
import { COLOR } from "../lib/format";
import { POS } from "./world";

const AMBER = new THREE.Color(COLOR.radio), BLUE = new THREE.Color(COLOR.wifi), RED = new THREE.Color(COLOR.bad);
interface Wave { t: number; color: THREE.Color; at: THREE.Vector3 }

/**
 * One big expanding ring at the moment something changes: the node switching to radio (amber) or back to
 * Wi-Fi (blue), the router vanishing or an alert being raised (red). It makes the handover impossible to miss.
 */
export default function Shockwave() {
  const waves = useRef<Wave[]>([]);
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const prev = useRef<{ mode: string | null; held: string | null; alert: string | null }>({ mode: null, held: null, alert: null });
  const geo = useMemo(() => new THREE.RingGeometry(0.975, 1, 128), []);
  const mats = useMemo(() => Array.from({ length: 4 }, () => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })), []);

  useFrame((_, dt) => {
    const snap = useHub.getState().snap;
    const mode = snap?.node.mode ?? null, held = snap?.held ?? null, alert = snap?.alert ?? null;
    const p = prev.current;
    if (p.mode && mode && mode !== p.mode) waves.current.push({ t: 0, color: mode === "radio" ? AMBER : BLUE, at: POS.A });
    if (p.held && held && held !== p.held && (held === "ap_down" || held === "auth_fail")) waves.current.push({ t: 0, color: RED, at: POS.hotspot });
    if (alert && alert !== p.alert) waves.current.push({ t: 0, color: RED, at: alert === "deauth" ? POS.air : POS.hotspot });
    prev.current = { mode: mode ?? p.mode, held: held ?? p.held, alert };
    if (waves.current.length > 4) waves.current.shift();

    for (let i = 0; i < 4; i++) {
      const m = refs.current[i], w = waves.current[i];
      if (!m) continue;
      if (!w) { m.visible = false; continue; }
      w.t += dt * 0.7;
      if (w.t >= 1) { waves.current.splice(i, 1); m.visible = false; continue; }
      const k = 1 - Math.pow(1 - w.t, 3);
      m.visible = true; m.position.set(w.at.x, 0.06, w.at.z); m.scale.setScalar(0.4 + k * 11);
      mats[i].color.copy(w.color).multiplyScalar(2.2); mats[i].opacity = Math.pow(1 - w.t, 1.8) * 0.8;
    }
  });

  return <>{mats.map((mat, i) => <mesh key={i} ref={(el) => { refs.current[i] = el; }} rotation-x={-Math.PI / 2} geometry={geo} material={mat} visible={false} />)}</>;
}
