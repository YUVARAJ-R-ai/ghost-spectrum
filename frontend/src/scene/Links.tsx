import { useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { COLOR } from "../lib/format";
import { RADIO_SPLIT, S, radioCurve, wifiCurve, node2Curve, node3Curve, introAt } from "./world";

const VERT = `varying float vU; void main(){ vU = uv.x; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// A glowing wire. Dashes stream along it; `uActive` brightens it, `uBreak` cuts a red gap into it and
// `uFlicker` makes it stutter (a fading signal). Past `uSplit` it turns into a solid cable (the USB leg).
const FRAG = `
uniform vec3 uColor; uniform float uTime, uActive, uBreak, uBreakAt, uFlicker, uSplit, uProgress, uSolid;
varying float vU;
float hash(float n){ return fract(sin(n) * 43758.5453); }
void main(){
  if (vU > uProgress) discard;
  float speed = 0.35 + uActive * 1.1;
  float flow = fract(vU * 30.0 - uTime * speed);
  float dash = smoothstep(0.0, 0.12, flow) * (1.0 - smoothstep(0.4, 0.55, flow));
  float cable = step(uSplit, vU) * uSolid;
  float pat = mix(dash, 0.5 + 0.3 * dash, cable);
  float inten = mix(0.16 + 0.34 * pat, 1.0 + 0.6 * pat + 1.6 * pat * pat, uActive);
  float tick = floor(uTime * 14.0);
  float stutter = mix(1.0, step(0.35, hash(tick + floor(vU * 12.0))), uFlicker * 0.8);
  inten *= stutter;
  float d = abs(vU - uBreakAt);
  float gap = smoothstep(0.035, 0.075, d);
  inten *= mix(1.0, gap, uBreak);
  vec3 col = mix(uColor, vec3(1.0, 0.22, 0.3), uBreak * (1.0 - gap) * 0.9);
  float spark = (1.0 - gap) * uBreak * step(0.5, hash(tick * 1.7)) * 2.2;
  inten += spark;
  gl_FragColor = vec4(col * inten, 1.0);
}`;

function Wire({ curve, color, solid, tick }: { curve: THREE.Curve<THREE.Vector3>; color: string; solid?: number; tick: (u: Record<string, { value: any }>) => void }) {
  const geo = useMemo(() => new THREE.TubeGeometry(curve, 240, 0.036, 6, false), [curve]);
  // built by hand (not via JSX props) so the very object we mutate each frame is the one the GPU reads
  const mat = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uActive: { value: 0 }, uBreak: { value: 0 }, uBreakAt: { value: 0.5 },
      uFlicker: { value: 0 }, uSplit: { value: solid ?? 2 }, uProgress: { value: 0 }, uSolid: { value: solid ? 1 : 0 },
    },
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }), [color, solid]);
  useFrame(({ clock }) => {
    const u = mat.uniforms;
    u.uTime.value = clock.elapsedTime; u.uProgress.value = introAt(1.0, 1.4) * 1.02; tick(u);
  });
  return <mesh geometry={geo} material={mat} frustumCulled={false} />;
}

export default function Links() {
  return (
    <>
      {/* Node 1: Sensor -> Hotspot -> Laptop (Cyan) */}
      <Wire curve={wifiCurve} color={COLOR.wifi} tick={(u) => {
        u.uActive.value = S.online * S.wifiUp * (1 - S.radio * 0.6);
        const dead = S.online * (1 - S.wifiUp);
        u.uBreak.value = Math.max(dead, S.auth);
        u.uBreakAt.value = S.auth > 0.5 ? 0.3 : 0.5;
        u.uFlicker.value = S.wifiUp * (1 - S.strength) * 0.9 + S.congest * 0.5;
      }} />

      {/* Node 2: Supervisor -> Hotspot -> Laptop (Emerald / Green) */}
      <Wire curve={node2Curve} color={COLOR.good} tick={(u) => {
        u.uActive.value = S.gw * 0.9;
        u.uBreak.value = 0;
        u.uFlicker.value = 0;
      }} />

      {/* Node 3: Sentinel -> Hotspot -> Laptop (Violet / Red on attack) */}
      <Wire curve={node3Curve} color={COLOR.violet} tick={(u) => {
        u.uActive.value = S.airOn * (1 + S.deauth * 1.5);
        u.uBreak.value = S.deauth > 0.3 ? 0.7 : 0;
        u.uBreakAt.value = 0.45;
        u.uFlicker.value = S.deauth * 0.8;
      }} />

      {/* Legacy Radio Route (Amber) */}
      <Wire curve={radioCurve} color={COLOR.radio} solid={RADIO_SPLIT} tick={(u) => {
        u.uActive.value = S.radio;
        u.uBreak.value = 0;
        u.uFlicker.value = 0;
      }} />
    </>
  );
}
