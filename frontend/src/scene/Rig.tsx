import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { CameraControls } from "@react-three/drei";
import * as THREE from "three";
import { useUi } from "../lib/store";
import { POS } from "./world";

const TARGET = new THREE.Vector3(0, 0.75, -0.2);
const HOME_AZ = 0.16, HOME_POL = 1.06;
const WORLD_W = 12.6, WORLD_H = 9.2;

/**
 * Camera: frames the stage inside whatever space the UI panels leave free, sways gently while idle,
 * flies to a node when you click it, and flies back when you close it.
 */
export default function Rig() {
  const ctl = useRef<CameraControls>(null!);
  const { camera, size } = useThree();
  const focus = useUi((s) => s.focus);
  const autoRotate = useUi((s) => s.autoRotate);
  const idleAt = useRef(0);
  const dir = useRef(1);
  const home = useRef({ d: 16, pol: HOME_POL });

  // Compute framing for the current viewport and shift the projection so the stage centres in the free area.
  useEffect(() => {
    const vw = size.width, vh = size.height;
    const cam = camera as THREE.PerspectiveCamera;
    let left = 28, right = vw - 28, top = 84, bottom = vh - 28;
    if (vw >= 768) { right = vw - 380 - 44; bottom = vh - 48; }
    else { top = 62; bottom = vh * 0.54; left = 0; right = vw; }
    const freeW = Math.max(200, right - left), freeH = Math.max(160, bottom - top);
    const t = Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
    const mobile = vw < 768;
    home.current.pol = mobile ? 0.95 : HOME_POL;   // phones view the stage from higher up
    const dW = ((mobile ? 11.8 : WORLD_W) * (vh / 2)) / (t * freeW * 0.97);
    const dH = ((mobile ? 6.6 : WORLD_H) * (vh / 2)) / (t * freeH * 0.92);
    home.current.d = THREE.MathUtils.clamp(Math.max(dW, dH), 9, 70);
    const cx = (left + right) / 2 + (vw >= 768 ? 12 : 0), cy = (top + bottom) / 2 - (vw >= 768 ? 52 : 0);
    cam.setViewOffset(vw, vh, -(cx - vw / 2), -(cy - vh / 2), vw, vh);
    if (ctl.current && !useUi.getState().focus) goHome(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [size.width, size.height]);

  const goHome = (animate: boolean) => {
    const c = ctl.current; if (!c) return;
    const d = home.current.d;
    const az = HOME_AZ, pol = home.current.pol;
    c.setLookAt(
      TARGET.x + d * Math.sin(pol) * Math.sin(az), TARGET.y + d * Math.cos(pol), TARGET.z + d * Math.sin(pol) * Math.cos(az),
      TARGET.x, TARGET.y, TARGET.z, animate,
    );
  };

  // entrance: start far and high, glide in
  useEffect(() => {
    const c = ctl.current; if (!c) return;
    const d = home.current.d * 1.9;
    c.setLookAt(TARGET.x + d * 0.25, TARGET.y + d * 0.55, TARGET.z + d * 0.8, TARGET.x, TARGET.y, TARGET.z, false);
    c.smoothTime = 1.1;
    const id = setTimeout(() => goHome(true), 250);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const c = ctl.current; if (!c) return;
    if (focus) {
      const p = POS[focus === "A" ? "A" : focus];
      // stand back and a little to the side, aiming left of the node so it lands clear of the detail card
      c.setLookAt(p.x + 0.6, p.y + 2.9, p.z + 7.4, p.x - 1.1, p.y + 0.7, p.z, true);
    } else goHome(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus]);

  useEffect(() => {
    const c = ctl.current; if (!c) return;
    const down = () => { idleAt.current = performance.now() + 6000; };
    c.addEventListener("controlstart", down);
    c.addEventListener("control", down);
    return () => { c.removeEventListener("controlstart", down); c.removeEventListener("control", down); };
  }, []);

  // idle sway: a slow, bounded drift left and right so the stage always feels alive
  useFrame((_, dt) => {
    const c = ctl.current;
    if (!c || !autoRotate || useUi.getState().focus || performance.now() < idleAt.current) return;
    const az = c.azimuthAngle;
    if (az > HOME_AZ + 0.2) dir.current = -1;
    if (az < HOME_AZ - 0.2) dir.current = 1;
    c.rotate(dir.current * Math.min(dt, 0.05) * 0.03, 0, false);
  });

  return (
    <CameraControls ref={ctl} makeDefault minDistance={5} maxDistance={80} minPolarAngle={0.55} maxPolarAngle={1.5}
      azimuthRotateSpeed={0.5} polarRotateSpeed={0.5} truckSpeed={0} draggingSmoothTime={0.14} dollySpeed={0.6} />
  );
}
