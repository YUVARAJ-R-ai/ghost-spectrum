import * as THREE from "three";
import { COLOR } from "../lib/format";
import type { NodeId } from "../lib/store";
import { POS, S } from "./world";

export interface TagDef { id: NodeId; title: string; sub: string; at: THREE.Vector3; dot: () => string }
export const TAGS: TagDef[] = [
  { id: "A", title: "Node A", sub: "IoT device", at: POS.A.clone().setY(2.55), dot: () => (S.online > 0.5 ? (S.radio > 0.5 ? COLOR.radio : COLOR.good) : "#4a4d58") },
  { id: "hotspot", title: "The router", sub: "phone hotspot", at: POS.hotspot.clone().setY(3.95), dot: () => (S.wifiUp > 0.5 ? (S.strength > 0.45 ? COLOR.good : COLOR.radio) : COLOR.bad) },
  { id: "laptop", title: "Laptop hub", sub: "merges both paths", at: POS.laptop.clone().setY(2.35), dot: () => COLOR.good },
  { id: "gateway", title: "Node B", sub: "433 MHz gateway", at: POS.gateway.clone().setY(1.8), dot: () => (S.gw < 0.5 ? "#4a4d58" : S.relay > 0.5 ? COLOR.radio : COLOR.good) },
  { id: "air", title: "Node C", sub: "air watcher", at: POS.air.clone().setY(1.45), dot: () => (S.airOn < 0.5 ? "#4a4d58" : S.deauth > 0.5 ? COLOR.bad : COLOR.good) },
];

// screen position of each tag in CSS pixels, written by the 3D side every frame, read by the DOM side
export const tagScreen: Record<string, { x: number; y: number; s: number; v: boolean }> = {};
