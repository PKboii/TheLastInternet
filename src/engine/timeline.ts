/* THE LAST INTERNET — cinematic timeline.
   Scroll position p ∈ [0,1] is a film timeline: camera choreography,
   atmosphere, and story cues are all functions of p. */

import * as THREE from 'three';
import type { RegionId } from './audio';

export interface CamKey {
  p: number;
  pos: [number, number, number];
  look: [number, number, number];
  fov: number;
  orbit?: number; // lateral sine amplitude for cinematic swing
}

export interface AtmosKey {
  p: number;
  fogColor: number;
  fogDensity: number;
  bloom: number;
  grain: number;
  scan: number;
  chroma: number;
  glitch: number;
  exposure: number;
}

export type CueKind = 'system' | 'visitor' | 'anomaly' | 'guide' | 'echo';

export interface StoryCue {
  id: string;
  at: number;
  kind: CueKind;
  text: string;
}

/* ------------------------------------------------------------------ */
/*  CAMERA CHOREOGRAPHY                                                */
/* ------------------------------------------------------------------ */

export const CAM_KEYS: CamKey[] = [
  { p: 0.0,    pos: [0, 2, 8],       look: [0, 2, -120],    fov: 60 },
  { p: 0.045,  pos: [0, 8, 95],      look: [0, 0, -260],    fov: 72 },
  { p: 0.09,   pos: [0, 30, 185],    look: [0, -8, -380],   fov: 78, orbit: 14 }, // extreme wide: the universe
  { p: 0.145,  pos: [6, 10, 40],     look: [0, 0, -140],    fov: 70 },            // dive into the archive
  { p: 0.2,    pos: [-34, 3, -120],  look: [24, 5, -230],   fov: 68, orbit: 10 }, // weaving through pages
  { p: 0.26,   pos: [28, -6, -275],  look: [-16, -12, -390],fov: 66, orbit: 8 },
  { p: 0.31,   pos: [2, -12, -430],  look: [0, -30, -570],  fov: 64 },            // graveyard descent
  { p: 0.375,  pos: [-24, -34, -585],look: [14, -42, -705], fov: 62, orbit: 7 },  // between the towers
  { p: 0.435,  pos: [16, -26, -765], look: [-6, -32, -900], fov: 64 },
  { p: 0.5,    pos: [2, -16, -935],  look: [0, -26, -1060], fov: 67 },            // social city approach
  { p: 0.56,   pos: [-38, -8, -1125],look: [22, -20, -1235],fov: 63, orbit: 12 }, // street-level sweep
  { p: 0.62,   pos: [24, -12, -1305],look: [-4, -22, -1425],fov: 68 },
  { p: 0.68,   pos: [2, -8, -1475],  look: [0, -30, -1630], fov: 73 },            // glide over the ocean
  { p: 0.745,  pos: [0, 8, -1730],   look: [0, -6, -1880],  fov: 75, orbit: 9 },
  { p: 0.8,    pos: [4, 34, -1990],  look: [0, 75, -2160],  fov: 78 },            // look up: neural sky
  { p: 0.855,  pos: [-26, 58, -2165],look: [6, 38, -2330],  fov: 73, orbit: 10 }, // between entities
  { p: 0.905,  pos: [0, 8, -2385],   look: [0, -45, -2530], fov: 66 },            // the descent
  { p: 0.95,   pos: [0, -58, -2565], look: [0, -68, -2685], fov: 56 },            // corridor of the final server
  { p: 0.985,  pos: [0, -65, -2638], look: [0, -67, -2685], fov: 48 },            // face the server
  { p: 1.0,    pos: [0, -65, -2638], look: [0, -67, -2685], fov: 48 },
];

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();

function smooth(u: number): number {
  return u * u * (3 - 2 * u);
}

export function cameraAt(
  p: number,
  outPos: THREE.Vector3,
  outLook: THREE.Vector3
): { fov: number; orbit: number } {
  const keys = CAM_KEYS;
  const cp = THREE.MathUtils.clamp(p, 0, 1);
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].p < cp) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = Math.max(0.0001, b.p - a.p);
  const u = smooth(THREE.MathUtils.clamp((cp - a.p) / span, 0, 1));

  outPos.set(
    THREE.MathUtils.lerp(a.pos[0], b.pos[0], u),
    THREE.MathUtils.lerp(a.pos[1], b.pos[1], u),
    THREE.MathUtils.lerp(a.pos[2], b.pos[2], u)
  );
  outLook.set(
    THREE.MathUtils.lerp(a.look[0], b.look[0], u),
    THREE.MathUtils.lerp(a.look[1], b.look[1], u),
    THREE.MathUtils.lerp(a.look[2], b.look[2], u)
  );
  return {
    fov: THREE.MathUtils.lerp(a.fov, b.fov, u),
    orbit: THREE.MathUtils.lerp(a.orbit ?? 0, b.orbit ?? 0, u),
  };
}

/** Sample the camera path itself (for the guided particle stream). */
export function samplePath(t: number, out: THREE.Vector3): THREE.Vector3 {
  cameraAt(t, out, _look);
  return out;
}

export function pathLook(t: number, out: THREE.Vector3): THREE.Vector3 {
  cameraAt(t, _pos, out);
  return out;
}

/* ------------------------------------------------------------------ */
/*  ATMOSPHERE                                                         */
/* ------------------------------------------------------------------ */

export const ATMOS_KEYS: AtmosKey[] = [
  { p: 0.0,   fogColor: 0x000000, fogDensity: 0.028, bloom: 0.5,  grain: 0.10, scan: 0.35, chroma: 0.15, glitch: 0.0,  exposure: 0.9 },
  { p: 0.06,  fogColor: 0x020507, fogDensity: 0.012, bloom: 1.15, grain: 0.08, scan: 0.25, chroma: 0.35, glitch: 0.25, exposure: 1.0 },
  { p: 0.11,  fogColor: 0x04101a, fogDensity: 0.0055,bloom: 1.0,  grain: 0.06, scan: 0.18, chroma: 0.22, glitch: 0.0,  exposure: 1.05 },
  { p: 0.22,  fogColor: 0x04141a, fogDensity: 0.005, bloom: 0.95, grain: 0.06, scan: 0.15, chroma: 0.2,  glitch: 0.0,  exposure: 1.05 },
  { p: 0.31,  fogColor: 0x03100c, fogDensity: 0.007, bloom: 0.85, grain: 0.07, scan: 0.2,  chroma: 0.2,  glitch: 0.05, exposure: 1.0 },
  { p: 0.44,  fogColor: 0x05100a, fogDensity: 0.0075,bloom: 0.9,  grain: 0.07, scan: 0.22, chroma: 0.22, glitch: 0.08, exposure: 1.0 },
  { p: 0.5,   fogColor: 0x120e05, fogDensity: 0.006, bloom: 1.05, grain: 0.06, scan: 0.18, chroma: 0.25, glitch: 0.05, exposure: 1.08 },
  { p: 0.62,  fogColor: 0x141006, fogDensity: 0.006, bloom: 1.0,  grain: 0.06, scan: 0.16, chroma: 0.25, glitch: 0.05, exposure: 1.06 },
  { p: 0.68,  fogColor: 0x031014, fogDensity: 0.005, bloom: 0.95, grain: 0.05, scan: 0.12, chroma: 0.2,  glitch: 0.0,  exposure: 1.02 },
  { p: 0.78,  fogColor: 0x030b10, fogDensity: 0.0042,bloom: 1.0,  grain: 0.05, scan: 0.1,  chroma: 0.2,  glitch: 0.0,  exposure: 1.0 },
  { p: 0.84,  fogColor: 0x0d0410, fogDensity: 0.004, bloom: 1.25, grain: 0.07, scan: 0.16, chroma: 0.35, glitch: 0.18, exposure: 1.02 },
  { p: 0.9,   fogColor: 0x060308, fogDensity: 0.009, bloom: 0.9,  grain: 0.09, scan: 0.25, chroma: 0.3,  glitch: 0.22, exposure: 0.95 },
  { p: 0.95,  fogColor: 0x000000, fogDensity: 0.013, bloom: 0.75, grain: 0.1,  scan: 0.3,  chroma: 0.2,  glitch: 0.1,  exposure: 0.85 },
  { p: 1.0,   fogColor: 0x000000, fogDensity: 0.015, bloom: 1.1,  grain: 0.1,  scan: 0.3,  chroma: 0.15, glitch: 0.05, exposure: 0.8 },
];

const _fogA = new THREE.Color();
const _fogB = new THREE.Color();

export function atmosAt(p: number): AtmosKey {
  const keys = ATMOS_KEYS;
  const cp = THREE.MathUtils.clamp(p, 0, 1);
  let i = 0;
  while (i < keys.length - 2 && keys[i + 1].p < cp) i++;
  const a = keys[i];
  const b = keys[i + 1];
  const span = Math.max(0.0001, b.p - a.p);
  const u = smooth(THREE.MathUtils.clamp((cp - a.p) / span, 0, 1));
  _fogA.setHex(a.fogColor);
  _fogB.setHex(b.fogColor);
  _fogA.lerp(_fogB, u);
  return {
    p: cp,
    fogColor: _fogA.getHex(),
    fogDensity: THREE.MathUtils.lerp(a.fogDensity, b.fogDensity, u),
    bloom: THREE.MathUtils.lerp(a.bloom, b.bloom, u),
    grain: THREE.MathUtils.lerp(a.grain, b.grain, u),
    scan: THREE.MathUtils.lerp(a.scan, b.scan, u),
    chroma: THREE.MathUtils.lerp(a.chroma, b.chroma, u),
    glitch: THREE.MathUtils.lerp(a.glitch, b.glitch, u),
    exposure: THREE.MathUtils.lerp(a.exposure, b.exposure, u),
  };
}

/* ------------------------------------------------------------------ */
/*  REGIONS                                                            */
/* ------------------------------------------------------------------ */

export interface RegionDef {
  id: RegionId;
  name: string;
  from: number;
  to: number;
}

export const REGIONS: RegionDef[] = [
  { id: 'void',      name: 'SIGNAL VOID',        from: -1,   to: 0.02 },
  { id: 'outer',     name: 'OUTER NETWORK',      from: 0.02, to: 0.1 },
  { id: 'archive',   name: 'THE ARCHIVE',        from: 0.1,  to: 0.3 },
  { id: 'graveyard', name: 'SERVER GRAVEYARD',   from: 0.3,  to: 0.48 },
  { id: 'city',      name: 'THE SOCIAL CITY',    from: 0.48, to: 0.64 },
  { id: 'ocean',     name: 'MEMORY OCEAN',       from: 0.64, to: 0.78 },
  { id: 'ai',        name: 'THE AI ZONE',        from: 0.78, to: 0.9 },
  { id: 'descent',   name: 'UNMAPPED DESCENT',   from: 0.9,  to: 0.95 },
  { id: 'final',     name: 'THE FINAL SERVER',   from: 0.95, to: 2 },
];

export function regionAt(p: number): RegionDef {
  for (const r of REGIONS) if (p >= r.from && p < r.to) return r;
  return REGIONS[REGIONS.length - 1];
}

/* ------------------------------------------------------------------ */
/*  STORY CUES                                                         */
/* ------------------------------------------------------------------ */

export const STORY_CUES: StoryCue[] = [
  { id: 'reveal',     at: 0.085, kind: 'system',  text: 'YOU ARE INSIDE THE REMAINS OF THE INTERNET.' },
  { id: 'archive-in', at: 0.115, kind: 'system',  text: 'REGION 01 — THE ARCHIVE. 4.1 BILLION DEAD PAGES.' },
  { id: 'links',      at: 0.18,  kind: 'echo',    text: 'some pages still believe they are loading.' },
  { id: 'watch1',     at: 0.245, kind: 'echo',    text: 'a page turned to face you. pages do not turn.' },
  { id: 'warm',       at: 0.29,  kind: 'anomaly', text: 'ANOMALY — THERMAL SIGNATURE DETECTED BELOW' },
  { id: 'grave-in',   at: 0.325, kind: 'system',  text: 'REGION 02 — SERVER GRAVEYARD. COOLING SYSTEMS: ACTIVE.' },
  { id: 'some1',      at: 0.365, kind: 'visitor', text: 'SOMEONE WAS HERE.' },
  { id: 'keep',       at: 0.415, kind: 'visitor', text: 'IF YOU CAN READ THIS, KEEP GOING.' },
  { id: 'city-in',    at: 0.5,   kind: 'system',  text: 'REGION 03 — THE SOCIAL CITY. POPULATION: 0. PROCESS: 1.' },
  { id: 'trust',      at: 0.545, kind: 'visitor', text: "DON'T TRUST THE ARCHIVE." },
  { id: 'see',        at: 0.605, kind: 'visitor', text: 'THEY CAN SEE YOU.' },
  { id: 'ocean-in',   at: 0.655, kind: 'system',  text: 'REGION 04 — MEMORY OCEAN. HUMAN DATA, STILL SUSPENDED.' },
  { id: 'out',        at: 0.7,   kind: 'visitor', text: "I COULDN'T MAKE IT OUT." },
  { id: 'first',      at: 0.745, kind: 'visitor', text: 'YOU ARE NOT THE FIRST.' },
  { id: 'ai-in',      at: 0.795, kind: 'system',  text: 'REGION 05 — THE AI ZONE. DO NOT ANNOUNCE YOURSELF.' },
  { id: 'remember',   at: 0.845, kind: 'visitor', text: 'WE REMEMBER THE LAST VISITOR.' },
  { id: 'door',       at: 0.915, kind: 'visitor', text: "ALMOST THERE. I'LL OPEN THE DOOR." },
  { id: 'sacred',     at: 0.94,  kind: 'echo',    text: 'it is very quiet here. it has always been quiet here.' },
];

export const WELCOME_LINES = [
  'CONNECTION STILL ACTIVE.',
  'SESSION SAVED.',
  'NEW VISITOR DETECTED.',
];
