import { useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Environment, Grid, Lightformer, MeshReflectorMaterial, Sparkles } from "@react-three/drei";
import * as THREE from "three";
import { useUi } from "../lib/store";
import { S } from "./world";

/** A huge inverted sphere whose horizon glow takes on the link's accent colour. */
function Sky() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, toneMapped: false,
    uniforms: { uAccent: { value: new THREE.Color() }, uAlert: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `uniform vec3 uAccent; uniform float uAlert, uTime; varying vec3 vP;
      void main(){
        float h = vP.y;
        vec3 base = vec3(0.012, 0.014, 0.022);
        // the horizon glow drifts slowly, so the backdrop is never perfectly still
        float sway = 0.03 * sin(atan(vP.x, vP.z) * 3.0 + uTime * 0.18) + 0.015 * sin(atan(vP.x, vP.z) * 7.0 - uTime * 0.11);
        float band = exp(-abs(h + 0.02 + sway) * 5.5);
        vec3 col = base + uAccent * band * (0.06 + uAlert * 0.05) + vec3(0.02,0.03,0.07) * smoothstep(0.0, 1.0, h) * 0.6;
        gl_FragColor = vec4(col, 1.0);
      }`,
  }), []);
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uAccent.value.copy(S.accent);
    mat.uniforms.uAlert.value = Math.max(S.deauth, S.auth);
  });
  return (
    <mesh scale={60} renderOrder={-10} material={mat}>
      <sphereGeometry args={[1, 32, 20]} />
    </mesh>
  );
}

/** A soft pool of light on the stage floor, in the link's accent colour, with a slow breathing pulse. */
function FloorGlow() {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false,
    uniforms: { uAccent: { value: new THREE.Color() }, uTime: { value: 0 }, uAlert: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform vec3 uAccent; uniform float uTime, uAlert; varying vec2 vUv;
      void main(){
        float r = length(vUv - 0.5) * 2.0;
        float pool = smoothstep(1.0, 0.0, r);
        float rings = 0.5 + 0.5 * sin(r * 26.0 - uTime * 0.6);
        float a = pool * pool * (0.16 + 0.03 * sin(uTime * 0.8)) + pool * 0.05 * rings * pool;
        a *= 1.0 + uAlert * 0.6;
        gl_FragColor = vec4(uAccent * a, 1.0);
      }`,
  }), []);
  useFrame(({ clock }) => {
    mat.uniforms.uTime.value = clock.elapsedTime;
    mat.uniforms.uAccent.value.copy(S.accent);
    mat.uniforms.uAlert.value = Math.max(S.deauth, S.auth);
  });
  return <mesh rotation-x={-Math.PI / 2} position-y={0.006} material={mat}><planeGeometry args={[19, 19]} /></mesh>;
}

/** Small beads that circle the outer ring forever. They are there only to make the stage feel alive. */
function RingBeads() {
  const ref = useRef<THREE.InstancedMesh>(null!);
  const o = useMemo(() => new THREE.Object3D(), []);
  const c = useMemo(() => new THREE.Color(), []);
  const N = 36;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    for (let i = 0; i < N; i++) {
      const a = (i / N) * Math.PI * 2 + t * (0.05 + (i % 3) * 0.012) * (i % 2 ? 1 : -1);
      const r = 7.55 + (i % 4 === 0 ? 0.35 : 0);
      o.position.set(Math.cos(a) * r, 0.05, Math.sin(a) * r); o.scale.setScalar(i % 5 === 0 ? 0.075 : 0.045); o.updateMatrix();
      ref.current.setMatrixAt(i, o.matrix);
      ref.current.setColorAt(i, c.copy(S.accent).multiplyScalar(i % 5 === 0 ? 3 : 1.5));
    }
    ref.current.instanceMatrix.needsUpdate = true;
    if (ref.current.instanceColor) ref.current.instanceColor.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, N]} frustumCulled={false}>
      <sphereGeometry args={[1, 8, 6]} /><meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}

/** The circular stage: a dark mirror floor, a fine grid, and a thin ring that glows with the link's colour. */
function Floor() {
  const quality = useUi((s) => s.quality);
  const ring = useRef<THREE.MeshBasicMaterial>(null!);
  const ring2 = useRef<THREE.MeshBasicMaterial>(null!);
  useFrame(({ clock }) => {
    ring.current.color.copy(S.accent);
    ring.current.opacity = 0.35 + Math.sin(clock.elapsedTime * 1.2) * 0.06;
    ring2.current.color.copy(S.accent);
  });
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0}>
        <circleGeometry args={[11, 96]} />
        {quality === "high" ? (
          <MeshReflectorMaterial blur={[380, 90]} resolution={512} mixBlur={1.2} mixStrength={5.5} roughness={0.9} depthScale={1.1}
            minDepthThreshold={0.4} maxDepthThreshold={1.5} color="#07080d" metalness={0.55} mirror={0.6} />
        ) : <meshStandardMaterial color="#07080d" roughness={0.8} metalness={0.4} />}
      </mesh>
      <Grid position-y={0.004} args={[40, 40]} cellSize={0.6} cellThickness={0.5} cellColor="#232c47" sectionSize={3} sectionThickness={1.1}
        sectionColor="#38487a" fadeDistance={17} fadeStrength={1.4} infiniteGrid />
      <mesh rotation-x={-Math.PI / 2} position-y={0.012}>
        <ringGeometry args={[7.55, 7.585, 128]} />
        <meshBasicMaterial ref={ring} transparent toneMapped={false} depthWrite={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.011}>
        <ringGeometry args={[7.9, 7.915, 128, 1]} />
        <meshBasicMaterial ref={ring2} transparent opacity={0.12} toneMapped={false} depthWrite={false} />
      </mesh>
    </group>
  );
}

export default function Stage() {
  return (
    <>
      <color attach="background" args={["#050507"]} />
      <fog attach="fog" args={["#050507", 16, 42]} />
      <Sky />
      <ambientLight intensity={0.28} />
      <directionalLight position={[-6, 9, 7]} intensity={1.5} color="#c6dcff" />
      <directionalLight position={[8, 5, -7]} intensity={0.7} color="#ffd2a8" />
      {/* reflections for the metal and glass come from this little light studio, not a downloaded HDR (works offline) */}
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={2.2} position={[0, 6, 4]} scale={[10, 3, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={1.2} position={[-8, 2, 0]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} color="#8ab8ff" />
        <Lightformer form="rect" intensity={1.0} position={[8, 3, -2]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} color="#ffb36b" />
      </Environment>
      <Floor />
      <FloorGlow />
      <RingBeads />
      <Sparkles count={70} scale={[18, 5, 12]} position={[0, 2.5, 0]} size={2.2} speed={0.18} opacity={0.35} color="#9db8ff" />
    </>
  );
}
