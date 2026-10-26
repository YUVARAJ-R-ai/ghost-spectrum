import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { easeOutCubic } from "./world";

interface Props {
  position: [number, number, number] | THREE.Vector3;
  color: () => THREE.Color | string;   // read each frame so it can follow the live accent
  power: () => number;                 // 0 = silent .. 1 = strong; drives opacity
  maxR?: number; minR?: number; rate?: number; count?: number; y?: number;
}

/** Concentric rings that spread across the floor like ripples: the visual for "this thing is radiating". */
export default function Ripples({ position, color, power, maxR = 3, minR = 0.4, rate = 0.35, count = 4, y = 0.02 }: Props) {
  const refs = useRef<(THREE.Mesh | null)[]>([]);
  const geo = useMemo(() => new THREE.RingGeometry(0.965, 1, 96, 1), []);
  const tmp = useMemo(() => new THREE.Color(), []);
  const mats = useMemo(() => Array.from({ length: count }, () => new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide })), [count]);

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const p = power();
    const c = color();
    for (let i = 0; i < count; i++) {
      const m = refs.current[i]; if (!m) continue;
      const phase = (t * rate + i / count) % 1;
      const r = minR + (maxR - minR) * easeOutCubic(phase);
      m.scale.setScalar(r);
      m.visible = p > 0.01;
      tmp.set(c as THREE.ColorRepresentation);
      mats[i].color.copy(tmp);
      mats[i].opacity = Math.pow(1 - phase, 1.6) * p * 0.8;
    }
  });

  return (
    <group position={position as THREE.Vector3} >
      {mats.map((mat, i) => (
        <mesh key={i} ref={(el) => { refs.current[i] = el; }} rotation-x={-Math.PI / 2} position-y={y} geometry={geo} material={mat} />
      ))}
    </group>
  );
}
