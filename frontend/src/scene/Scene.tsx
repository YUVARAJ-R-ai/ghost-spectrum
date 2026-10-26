import { Canvas } from "@react-three/fiber";
import { PerformanceMonitor } from "@react-three/drei";
import { Bloom, EffectComposer, Vignette, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";
import * as THREE from "three";
import { useUi } from "../lib/store";
import StateDriver from "./StateDriver";
import Stage from "./Stage";
import Rig from "./Rig";
import { AirWatcher, Gateway, Hotspot, Laptop, NodeA } from "./Nodes";
import Links from "./Links";
import Packets from "./Packets";
import TagProjector from "./TagProjector";

export default function Scene() {
  const quality = useUi((s) => s.quality);
  const setQuality = useUi((s) => s.setQuality);
  return (
    <div className="fixed inset-0 z-0">
      <Canvas camera={{ fov: 38, near: 0.1, far: 120, position: [3, 6, 15] }} dpr={quality === "high" ? [1, 1.75] : 1}
        gl={{ antialias: false, powerPreference: "high-performance", toneMapping: THREE.NoToneMapping }} onPointerMissed={() => useUi.getState().setFocus(null)}>
        <PerformanceMonitor onDecline={() => setQuality("low")} flipflops={2} />
        <StateDriver />
        <Stage />
        <Rig />
        <NodeA /><Hotspot /><Laptop /><Gateway /><AirWatcher />
        <Links />
        <Packets />
        <TagProjector />
        <EffectComposer multisampling={quality === "high" ? 4 : 0} enableNormalPass={false}>
          <Bloom intensity={quality === "high" ? 1.05 : 0.7} luminanceThreshold={0.62} luminanceSmoothing={0.25} mipmapBlur radius={0.72} />
          <Vignette offset={0.28} darkness={0.8} />
          <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
