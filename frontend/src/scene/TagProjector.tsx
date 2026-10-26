import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { TAGS, tagScreen } from "./tags";

const v = new THREE.Vector3();

/** Projects each node's 3D anchor to screen pixels so plain DOM labels can follow it (no per-label React roots). */
export default function TagProjector() {
  const { camera, size } = useThree();
  useFrame(() => {
    for (const t of TAGS) {
      v.copy(t.at).project(camera);
      const e = (tagScreen[t.id] ??= { x: 0, y: 0, s: 1, v: false });
      e.x = (v.x * 0.5 + 0.5) * size.width; e.y = (-v.y * 0.5 + 0.5) * size.height;
      e.v = v.z < 1 && Math.abs(v.x) < 1.2 && Math.abs(v.y) < 1.2;
    }
  });
  return null;
}
