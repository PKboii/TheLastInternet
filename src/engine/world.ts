/* THE LAST INTERNET — the world.
   Six archaeological layers of a dead internet, built procedurally.
   Everything is instanced or GPU-driven; nothing here is a static prop. */

import * as THREE from 'three';
import { samplePath } from './timeline';

export interface WorldHandles {
  root: THREE.Group;
  update(t: number, dt: number, cam: THREE.Vector3, camDir: THREE.Vector3, p: number, backward: boolean): void;
  interactives: THREE.Object3D[];
  burst(): void;
  setReveal(v: number): void;
  setBackwardPage(v: boolean): void;
  flashAt(v: THREE.Vector3): void;
  watcherGone: boolean;
  dispose(): void;
}

const COLD = new THREE.Color('#e4f1f2');
const CYAN = new THREE.Color('#5fc9d4');
const GREEN = new THREE.Color('#3ddc97');
const AMBER = new THREE.Color('#d9a441');
const ASH = new THREE.Color('#5a6a6e');
const BLOOD = new THREE.Color('#d8465e');

const FOG_CHUNK_V = `#include <fog_pars_vertex>`;
const FOG_WRITE_V = `#include <fog_vertex>`;
const FOG_CHUNK_F = `#include <fog_pars_fragment>`;
const FOG_WRITE_F = `#include <fog_fragment>`;

function fogUniforms(extra: Record<string, THREE.IUniform>): Record<string, THREE.IUniform> {
  return THREE.UniformsUtils.merge([THREE.UniformsLib.fog, extra]);
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/* ---------------- canvas texture helpers ---------------- */

function textCanvas(
  lines: string[],
  color: string,
  w = 256,
  h = 128,
  font = '500 26px "IBM Plex Mono", monospace'
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, w, h);
  g.font = font;
  g.fillStyle = color;
  g.textBaseline = 'middle';
  lines.forEach((l, i) => g.fillText(l, 12, h / 2 + (i - (lines.length - 1) / 2) * 30));
  return c;
}

function makeTexture(c: HTMLCanvasElement): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 2;
  return t;
}

const HTML_FRAGMENTS = [
  '<html>', '404 — NOT FOUND', '<a href="forever">', 'IMG_0041.jpg [CORRUPT]',
  'GET /home 503', '<blink>', 'we were here', 'loading…', 'cache expired',
  '<!-- TODO: fix before launch -->', 'HTTP/1.1 200 OK', 'connection reset',
  '<marquee> welcome </marquee>', 'index of /', '…they can see…', 'guestbook (0 new)',
  'under construction', 'best viewed at 800×600', 'you are visitor № 8,731,002',
  '<body bgcolor="#000000">', 'midi autoplay: off', 'last modified: never',
];

function memoryAtlas(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 1024;
  const g = c.getContext('2d')!;
  const rand = rng(9911);
  const labels = ['IMG_0041', 'voicemail 03', '12.03.2029', 'untitled.wav', 'scan_007', 'birthday', 'last summer', 'DSC_0002'];
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      const ox = x * 256;
      const oy = y * 256;
      const k = y * 4 + x;
      const hue = [187, 152, 42, 210, 160, 350][Math.floor(rand() * 6)];
      const grd = g.createLinearGradient(ox, oy, ox + 256, oy + 256);
      grd.addColorStop(0, `hsl(${hue} 30% ${4 + rand() * 5}%)`);
      grd.addColorStop(1, `hsl(${hue} 45% ${10 + rand() * 8}%)`);
      g.fillStyle = grd;
      g.fillRect(ox, oy, 256, 256);
      g.save();
      g.beginPath();
      g.rect(ox + 4, oy + 4, 248, 248);
      g.clip();
      if (k % 4 === 0) {
        // a sun over a horizon — someone's photograph
        g.fillStyle = `hsla(${hue} 60% 65% / 0.8)`;
        g.beginPath();
        g.arc(ox + 70 + rand() * 110, oy + 70 + rand() * 60, 26 + rand() * 22, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = `hsla(${hue} 40% 12% / 0.9)`;
        g.fillRect(ox, oy + 165, 256, 91);
      } else if (k % 4 === 1) {
        // a waveform — a voice
        g.strokeStyle = `hsla(${hue} 70% 65% / 0.85)`;
        g.lineWidth = 2;
        g.beginPath();
        for (let i = 0; i < 60; i++) {
          const px = ox + 14 + i * 3.8;
          const amp = (10 + rand() * 52) * (0.4 + 0.6 * Math.sin(i / 9));
          g.moveTo(px, oy + 128 - amp);
          g.lineTo(px, oy + 128 + amp);
        }
        g.stroke();
      } else if (k % 4 === 2) {
        // a face-shaped blur — a profile
        g.fillStyle = `hsla(${hue} 25% 55% / 0.5)`;
        g.beginPath();
        g.ellipse(ox + 128, oy + 105, 52, 62, 0, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = `hsla(${hue} 25% 45% / 0.5)`;
        g.beginPath();
        g.ellipse(ox + 128, oy + 220, 90, 60, 0, Math.PI, Math.PI * 2);
        g.fill();
      } else {
        // text message fragment
        g.fillStyle = `hsla(${hue} 60% 70% / 0.8)`;
        g.font = '500 20px "IBM Plex Mono", monospace';
        const msgs = ['where are you', 'call me back', 'i saved this for you', 'happy birthday', 'did you see the sky'];
        g.fillText(msgs[Math.floor(rand() * msgs.length)], ox + 18, oy + 120);
        g.fillStyle = `hsla(${hue} 60% 70% / 0.35)`;
        g.fillRect(ox + 18, oy + 140, 140 + rand() * 70, 3);
      }
      // noise
      for (let i = 0; i < 320; i++) {
        g.fillStyle = `rgba(255,255,255,${rand() * 0.06})`;
        g.fillRect(ox + rand() * 256, oy + rand() * 256, 1.4, 1.4);
      }
      g.restore();
      g.strokeStyle = 'rgba(95,201,212,0.35)';
      g.lineWidth = 2;
      g.strokeRect(ox + 5, oy + 5, 246, 246);
      g.fillStyle = 'rgba(228,241,242,0.5)';
      g.font = '400 15px "IBM Plex Mono", monospace';
      g.fillText(labels[k % labels.length], ox + 12, oy + 238);
    }
  }
  return c;
}

function avatarCanvas(seed: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  const rand = rng(seed);
  g.fillStyle = '#04090c';
  g.fillRect(0, 0, 256, 256);
  const hue = [187, 42, 152, 210][seed % 4];
  // pixelated profile monument
  const cell = 16;
  for (let y = 2; y < 14; y++) {
    for (let x = 4; x < 9; x++) {
      if (rand() < 0.5) {
        g.fillStyle = `hsla(${hue} 45% ${30 + rand() * 30}% / 0.9)`;
        g.fillRect(x * cell, y * cell, cell, cell);
        g.fillRect((15 - x) * cell, y * cell, cell, cell);
      }
    }
  }
  g.strokeStyle = `hsla(${hue} 60% 60% / 0.5)`;
  g.lineWidth = 3;
  g.strokeRect(8, 8, 240, 240);
  g.fillStyle = 'rgba(228,241,242,0.55)';
  g.font = '400 16px "IBM Plex Mono", monospace';
  g.fillText('user_' + String(1000 + Math.floor(rand() * 9000)), 14, 240);
  return c;
}

/* ---------------- shader sources ---------------- */

const PAGE_VERT = `
attribute vec3 aTint;
attribute float aSeed;
attribute float aLit;
uniform float uTime;
uniform vec3 uCam;
varying vec3 vTint;
varying vec2 vUv;
varying float vGlow;
varying float vSeed;
${FOG_CHUNK_V}
void main() {
  vUv = uv;
  vTint = aTint;
  vSeed = aSeed;
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  float d = distance(wp.xyz, uCam);
  float prox = smoothstep(70.0, 10.0, d);
  float flick = 0.5 + 0.5 * sin(uTime * (0.8 + aSeed * 2.4) + aSeed * 40.0);
  vGlow = aLit * flick * 0.75 + prox * 0.9;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  ${FOG_WRITE_V}
}`;

const PAGE_FRAG = `
varying vec3 vTint;
varying vec2 vUv;
varying float vGlow;
varying float vSeed;
${FOG_CHUNK_F}
void main() {
  vec2 uv = vUv;
  float ex = smoothstep(0.0, 0.07, uv.x) * smoothstep(1.0, 0.93, uv.x);
  float ey = smoothstep(0.0, 0.09, uv.y) * smoothstep(1.0, 0.91, uv.y);
  float edge = ex * ey;
  float row = step(0.55, fract(uv.y * 13.0 + vSeed * 7.0));
  float colb = step(0.25, fract(uv.x * 5.0 + vSeed * 3.0 + floor(uv.y * 13.0) * 0.37));
  vec3 content = vTint * 0.32 * row * colb;
  vec3 col = mix(vTint * (0.16 + vGlow * 1.15), content + vec3(0.012), edge);
  gl_FragColor = vec4(col, 1.0);
  ${FOG_WRITE_F}
}`;

const TOWER_VERT = `
attribute vec3 aTint;
attribute float aSeed;
attribute float aActive;
uniform float uTime;
varying vec3 vTint;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vSeed;
varying float vActive;
varying float vGlow;
${FOG_CHUNK_V}
void main() {
  vTint = aTint;
  vSeed = aSeed;
  vActive = aActive;
  vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  float flick = step(0.86, fract(sin(floor(wp.x * 2.0) + floor(wp.y * 1.7) + floor(uTime * 0.9) + aSeed * 91.0) * 43.1));
  vGlow = flick;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  ${FOG_WRITE_V}
}`;

const TOWER_FRAG = `
varying vec3 vTint;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vSeed;
varying float vActive;
varying float vGlow;
uniform float uWarm;
${FOG_CHUNK_F}
void main() {
  float side = 1.0 - abs(vNormalW.y);
  float wy = step(0.62, fract(vWorld.y * 0.22 + vSeed * 4.0));
  float wx = step(0.5, fract((vWorld.x + vWorld.z) * 0.35 + vSeed * 7.0));
  float win = wy * wx * side;
  vec3 base = vec3(0.016, 0.02, 0.024) + vTint * 0.05;
  vec3 col = base + vTint * win * (0.12 + vActive * vGlow * 1.1);
  col += vTint * uWarm * 0.4 * side;
  gl_FragColor = vec4(col, 1.0);
  ${FOG_WRITE_F}
}`;

const CITY_VERT = `
attribute vec3 aTint;
attribute float aSeed;
attribute float aActive;
uniform float uTime;
varying vec3 vTint;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vSeed;
varying float vActive;
varying float vFlick;
${FOG_CHUNK_V}
void main() {
  vTint = aTint;
  vSeed = aSeed;
  vActive = aActive;
  vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
  vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  float f = fract(sin(floor(wp.x * 3.1) + floor(wp.y * 2.3) + floor(wp.z * 1.7) + aSeed * 57.0 + floor(uTime * 1.4)) * 91.7);
  vFlick = step(0.78, f);
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  ${FOG_WRITE_V}
}`;

const CITY_FRAG = `
varying vec3 vTint;
varying vec3 vWorld;
varying vec3 vNormalW;
varying float vSeed;
varying float vActive;
varying float vFlick;
${FOG_CHUNK_F}
void main() {
  float side = 1.0 - abs(vNormalW.y);
  float wy = step(0.58, fract(vWorld.y * 0.35 + vSeed * 3.0));
  float wx = step(0.46, fract((vWorld.x + vWorld.z) * 0.4 + vSeed * 5.0));
  float win = wy * wx * side;
  vec3 base = vec3(0.02, 0.016, 0.012) + vTint * 0.03;
  float lit = win * (0.25 + vActive * vFlick * 1.5);
  vec3 col = base + vTint * lit;
  gl_FragColor = vec4(col, 1.0);
  ${FOG_WRITE_F}
}`;

const OCEAN_VERT = `
uniform float uTime;
varying vec3 vWorld;
${FOG_CHUNK_V}
void main() {
  vec3 p = position;
  float w = sin(p.x * 0.045 + uTime * 0.5) * 1.6
          + sin(p.y * 0.06 - uTime * 0.34) * 1.3
          + sin((p.x + p.y) * 0.02 + uTime * 0.22) * 2.4
          + sin(length(p.xy) * 0.03 - uTime * 0.4) * 1.1;
  p.z += w;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  ${FOG_WRITE_V}
}`;

const OCEAN_FRAG = `
uniform float uTime;
varying vec3 vWorld;
${FOG_CHUNK_F}
void main() {
  vec3 n = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
  vec3 v = normalize(cameraPosition - vWorld);
  float fres = pow(1.0 - max(0.0, dot(n, v)), 3.0);
  float gx = smoothstep(0.93, 1.0, fract(vWorld.x * 0.055 + uTime * 0.012));
  float gz = smoothstep(0.93, 1.0, fract(vWorld.z * 0.055 - uTime * 0.009));
  float grid = max(gx, gz) * 0.5;
  vec3 deep = vec3(0.006, 0.022, 0.028);
  vec3 col = deep + vec3(0.16, 0.45, 0.5) * fres * 0.55 + vec3(0.2, 0.6, 0.62) * grid * 0.22;
  float spec = pow(max(0.0, dot(reflect(-v, n), normalize(vec3(0.2, 1.0, 0.3)))), 40.0);
  col += vec3(0.5, 0.75, 0.78) * spec * 0.5;
  gl_FragColor = vec4(col, 1.0);
  ${FOG_WRITE_F}
}`;

const POINTS_VERT = `
attribute float aSize;
attribute vec3 aTint;
attribute float aSeed;
uniform float uTime;
uniform float uScale;
uniform float uFar;
varying vec3 vTint;
varying float vFade;
void main() {
  vec3 p = position;
  p.y += sin(uTime * 0.3 + aSeed * 6.2831) * 1.6;
  p.x += cos(uTime * 0.21 + aSeed * 4.0) * 1.3;
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float tw = 0.55 + 0.45 * sin(uTime * (0.5 + aSeed * 1.5) + aSeed * 30.0);
  vTint = aTint * tw;
  vFade = smoothstep(uFar, uFar * 0.25, -mv.z);
  gl_PointSize = clamp(aSize * uScale * tw / max(1.0, -mv.z), 0.0, 42.0);
  gl_Position = projectionMatrix * mv;
}`;

const POINTS_FRAG = `
varying vec3 vTint;
varying float vFade;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.05, d);
  a *= a * vFade;
  if (a < 0.004) discard;
  gl_FragColor = vec4(vTint, a);
}`;

const PULSE_VERT = `
attribute vec3 aFrom;
attribute vec3 aTo;
attribute float aSeed;
attribute float aSize;
attribute vec3 aTint;
uniform float uTime;
uniform float uScale;
varying vec3 vTint;
varying float vFade;
void main() {
  float t = fract(uTime * (0.04 + aSeed * 0.11) + aSeed);
  vec3 p = mix(aFrom, aTo, t);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vTint = aTint * (0.6 + 0.4 * sin(t * 3.14159));
  vFade = smoothstep(700.0, 150.0, -mv.z);
  gl_PointSize = clamp(aSize * uScale / max(1.0, -mv.z), 0.0, 30.0);
  gl_Position = projectionMatrix * mv;
}`;

const GUIDE_VERT = `
attribute float aS;
attribute float aSeed;
uniform float uP;
uniform float uTime;
uniform float uScale;
varying float vA;
varying vec3 vTint;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float near = smoothstep(0.055, 0.004, abs(aS - uP));
  float tw = 0.5 + 0.5 * sin(uTime * 3.0 + aSeed * 40.0);
  vA = near * (0.25 + 0.75 * tw);
  vTint = mix(vec3(0.37, 0.79, 0.83), vec3(0.85, 0.64, 0.26), aS);
  gl_PointSize = clamp((10.0 + aSeed * 16.0) * uScale * near / max(1.0, -mv.z), 0.0, 26.0);
  gl_Position = projectionMatrix * mv;
}`;

const GUIDE_FRAG = `
varying float vA;
varying vec3 vTint;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  float a = smoothstep(0.5, 0.0, d) * vA;
  if (a < 0.01) discard;
  gl_FragColor = vec4(vTint, a);
}`;

const BURST_VERT = `
attribute vec3 aTo;
attribute float aSeed;
uniform float uProg;
uniform float uScale;
varying float vA;
varying vec3 vTint;
void main() {
  float e = 1.0 - pow(1.0 - clamp(uProg, 0.0, 1.0), 3.0);
  vec3 p = mix(position, aTo, e);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vA = (1.0 - smoothstep(0.55, 1.0, uProg)) * (0.4 + 0.6 * fract(aSeed * 7.31));
  vTint = mix(vec3(0.37, 0.79, 0.83), vec3(0.89, 0.94, 0.95), fract(aSeed * 3.7));
  gl_PointSize = clamp((6.0 + aSeed * 22.0) * uScale / max(1.0, -mv.z), 0.0, 34.0);
  gl_Position = projectionMatrix * mv;
}`;

const NEURAL_VERT = `
attribute float aSize;
attribute vec3 aTint;
attribute float aSeed;
uniform float uTime;
uniform float uScale;
uniform float uPulse;
varying vec3 vTint;
varying float vFade;
void main() {
  vec3 p = position;
  p += 1.5 * vec3(sin(uTime * 0.4 + aSeed * 9.0), cos(uTime * 0.33 + aSeed * 7.0), sin(uTime * 0.27 + aSeed * 5.0));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float tw = 0.5 + 0.5 * sin(uTime * (1.0 + aSeed) + aSeed * 20.0);
  vTint = aTint * (0.5 + 0.5 * tw) * (1.0 + uPulse * 0.8);
  vFade = smoothstep(900.0, 200.0, -mv.z);
  gl_PointSize = clamp(aSize * uScale * (0.7 + 0.5 * tw) / max(1.0, -mv.z), 0.0, 40.0);
  gl_Position = projectionMatrix * mv;
}`;

/* ---------------- world builder ---------------- */

export function buildWorld(
  scene: THREE.Scene,
  quality: number,
  reducedMotion: boolean,
  onWatcherGone: () => void
): WorldHandles {
  const root = new THREE.Group();
  root.name = 'world-root';
  scene.add(root);

  const disposables: Array<{ dispose: () => void }> = [];
  const track = <T extends { dispose: () => void }>(d: T): T => {
    disposables.push(d);
    return d;
  };
  const interactives: THREE.Object3D[] = [];
  const updatables: Array<(t: number, dt: number, cam: THREE.Vector3, p: number) => void> = [];

  const pixelScale = 300 * quality + 120;

  /* ---------- ambient + key lights ---------- */
  const ambient = new THREE.AmbientLight(0x1c2a2e, 1.1);
  root.add(ambient);
  const warmLight = new THREE.PointLight(0xd9a441, 0, 110, 1.6);
  warmLight.position.set(30, -40, -695);
  root.add(warmLight);
  const serverLight = new THREE.PointLight(0xe4f1f2, 0, 200, 1.4);
  serverLight.position.set(0, -62, -2668);
  root.add(serverLight);
  const aiLight = new THREE.PointLight(0xd8465e, 0, 260, 1.5);
  aiLight.position.set(0, 90, -2160);
  root.add(aiLight);
  const cityLight = new THREE.PointLight(0xd9a441, 0, 240, 1.5);
  cityLight.position.set(0, 30, -1150);
  root.add(cityLight);

  /* ---------- 1. starfield / data dust ---------- */
  {
    const count = Math.floor(13000 * quality);
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const tint = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const rand = rng(4242);
    const palette = [COLD, COLD, COLD, CYAN, CYAN, GREEN, AMBER, ASH];
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (rand() - 0.5) * 700;
      pos[i * 3 + 1] = (rand() - 0.5) * 460 - 10;
      pos[i * 3 + 2] = 260 - rand() * 3260;
      size[i] = 4 + rand() * 16;
      const c = palette[Math.floor(rand() * palette.length)];
      const dim = 0.25 + rand() * 0.75;
      tint[i * 3] = c.r * dim;
      tint[i * 3 + 1] = c.g * dim;
      tint[i * 3 + 2] = c.b * dim;
      seed[i] = rand();
    }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = track(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: pixelScale }, uFar: { value: 1050 } },
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    root.add(pts);
    updatables.push((t) => { mat.uniforms.uTime.value = t; });
  }

  /* ---------- 2. network web + data pulses (outer + archive) ---------- */
  const networkSegments: Array<[THREE.Vector3, THREE.Vector3]> = [];
  {
    const rand = rng(777);
    const nodes: THREE.Vector3[] = [];
    const nodeCount = Math.floor(220 * quality + 60);
    for (let i = 0; i < nodeCount; i++) {
      nodes.push(new THREE.Vector3(
        (rand() - 0.5) * 420,
        (rand() - 0.5) * 260,
        120 - rand() * 620
      ));
    }
    const linePos: number[] = [];
    for (let i = 0; i < nodes.length; i++) {
      const n = 1 + Math.floor(rand() * 2);
      for (let k = 0; k < n; k++) {
        const j = Math.floor(rand() * nodes.length);
        if (j === i) continue;
        if (nodes[i].distanceTo(nodes[j]) > 160) continue;
        linePos.push(nodes[i].x, nodes[i].y, nodes[i].z, nodes[j].x, nodes[j].y, nodes[j].z);
        networkSegments.push([nodes[i].clone(), nodes[j].clone()]);
      }
    }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    const mat = track(new THREE.LineBasicMaterial({
      color: 0x5fc9d4, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    root.add(new THREE.LineSegments(geo, mat));
  }
  {
    const count = Math.min(networkSegments.length * 2, Math.floor(650 * quality));
    if (count > 0) {
      const from = new Float32Array(count * 3);
      const to = new Float32Array(count * 3);
      const seed = new Float32Array(count);
      const size = new Float32Array(count);
      const tint = new Float32Array(count * 3);
      const rand = rng(31337);
      for (let i = 0; i < count; i++) {
        const seg = networkSegments[Math.floor(rand() * networkSegments.length)];
        from[i * 3] = seg[0].x; from[i * 3 + 1] = seg[0].y; from[i * 3 + 2] = seg[0].z;
        to[i * 3] = seg[1].x; to[i * 3 + 1] = seg[1].y; to[i * 3 + 2] = seg[1].z;
        seed[i] = rand();
        size[i] = 5 + rand() * 12;
        const c = rand() < 0.75 ? CYAN : rand() < 0.5 ? COLD : GREEN;
        tint[i * 3] = c.r; tint[i * 3 + 1] = c.g; tint[i * 3 + 2] = c.b;
      }
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute('position', new THREE.BufferAttribute(from.slice(), 3));
      geo.setAttribute('aFrom', new THREE.BufferAttribute(from, 3));
      geo.setAttribute('aTo', new THREE.BufferAttribute(to, 3));
      geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
      geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
      const mat = track(new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uScale: { value: pixelScale } },
        vertexShader: PULSE_VERT,
        fragmentShader: POINTS_FRAG,
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      }));
      const pts = new THREE.Points(geo, mat);
      pts.frustumCulled = false;
      root.add(pts);
      updatables.push((t) => { mat.uniforms.uTime.value = t; });
    }
  }

  /* ---------- 3. THE ARCHIVE — fields of dead pages ---------- */
  const watchPages: THREE.Mesh[] = [];
  {
    const count = Math.floor(520 * quality);
    const geo = track(new THREE.BoxGeometry(7, 4.6, 0.08));
    const tints = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const lits = new Float32Array(count);
    const rand = rng(20260214);
    const mesh = new THREE.InstancedMesh(geo, undefined as unknown as THREE.Material, count);
    const mat = track(new THREE.ShaderMaterial({
      uniforms: fogUniforms({ uTime: { value: 0 }, uCam: { value: new THREE.Vector3() } }),
      vertexShader: PAGE_VERT,
      fragmentShader: PAGE_FRAG,
      fog: true,
    }));
    mesh.material = mat;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    const palette = [ASH, ASH, ASH, CYAN, COLD, GREEN, AMBER];
    for (let i = 0; i < count; i++) {
      const z = 30 - rand() * 430;
      e.set((rand() - 0.5) * 0.9, rand() * Math.PI * 2, (rand() - 0.5) * 0.5);
      q.setFromEuler(e);
      const sc = 0.4 + rand() * 1.5;
      s.set(sc, sc, 1);
      m.compose(
        new THREE.Vector3((rand() - 0.5) * 260, (rand() - 0.5) * 130, z),
        q, s
      );
      mesh.setMatrixAt(i, m);
      const c = palette[Math.floor(rand() * palette.length)];
      tints[i * 3] = c.r; tints[i * 3 + 1] = c.g; tints[i * 3 + 2] = c.b;
      seeds[i] = rand();
      lits[i] = rand() < 0.28 ? 1 : 0;
    }
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geo.setAttribute('aLit', new THREE.InstancedBufferAttribute(lits, 1));
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
    updatables.push((t, _dt, cam) => {
      mat.uniforms.uTime.value = t;
      (mat.uniforms.uCam.value as THREE.Vector3).copy(cam);
    });

    // dead hyperlinks between distant pages
    const linkPos: number[] = [];
    for (let i = 0; i < 150; i++) {
      const a = new THREE.Vector3((rand() - 0.5) * 240, (rand() - 0.5) * 120, 20 - rand() * 400);
      const b = a.clone().add(new THREE.Vector3((rand() - 0.5) * 160, (rand() - 0.5) * 90, -40 - rand() * 120));
      linkPos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const lgeo = track(new THREE.BufferGeometry());
    lgeo.setAttribute('position', new THREE.Float32BufferAttribute(linkPos, 3));
    const lmat = track(new THREE.LineBasicMaterial({
      color: 0x5fc9d4, transparent: true, opacity: 0.045, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    root.add(new THREE.LineSegments(lgeo, lmat));

    // drifting HTML fragments
    for (let i = 0; i < 34; i++) {
      const txt = HTML_FRAGMENTS[i % HTML_FRAGMENTS.length];
      const tex = track(makeTexture(textCanvas([txt], i % 5 === 0 ? '#d9a441' : '#5fc9d4', 320, 64, '400 24px "IBM Plex Mono", monospace')));
      const smat = track(new THREE.SpriteMaterial({
        map: tex, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const sp = new THREE.Sprite(smat);
      const base = new THREE.Vector3((rand() - 0.5) * 220, (rand() - 0.5) * 110, 10 - rand() * 400);
      sp.position.copy(base);
      sp.scale.set(14, 2.8, 1);
      const ph = rand() * 10;
      root.add(sp);
      updatables.push((t) => {
        if (reducedMotion) return;
        sp.position.y = base.y + Math.sin(t * 0.3 + ph) * 3;
        sp.position.x = base.x + Math.cos(t * 0.2 + ph) * 2.4;
        smat.opacity = 0.3 + 0.25 * Math.sin(t * 0.8 + ph);
      });
    }

    // pages that watch
    for (let i = 0; i < 5; i++) {
      const tex = track(makeTexture(textCanvas(['▓▓▓▓▓▓▓▓', '▓ ◉    ◉ ▓', '▓▓▓▓▓▓▓▓'], '#9fdbe2', 256, 160)));
      const m2 = track(new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const pg = new THREE.Mesh(track(new THREE.PlaneGeometry(9, 5.6)), m2);
      const side = i % 2 === 0 ? 1 : -1;
      pg.position.set(side * (16 + i * 6), 6 - i * 4, -40 - i * 55);
      pg.userData = { id: 'watch-page', kind: 'watcher' };
      root.add(pg);
      watchPages.push(pg);
      interactives.push(pg);
      updatables.push((t, _dt, cam) => {
        if (pg.position.distanceTo(cam) < 130) {
          const target = cam.clone();
          if (!reducedMotion) target.y += Math.sin(t * 0.7 + i) * 1.5;
          pg.lookAt(target);
          m2.opacity = 0.5 + 0.35 * Math.sin(t * 1.3 + i * 2.2);
        } else {
          m2.opacity = 0.25;
        }
      });
    }
  }

  /* ---------- easter egg: the backward-only page ---------- */
  const backwardPage = (() => {
    const tex = track(makeTexture(textCanvas(
      ['THIS PAGE ONLY EXISTS', 'WHEN YOU GO BACK.'], '#d9a441', 340, 120, '500 22px "IBM Plex Mono", monospace'
    )));
    const mat = track(new THREE.MeshBasicMaterial({
      map: tex, transparent: true, opacity: 0.95, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const msh = new THREE.Mesh(track(new THREE.PlaneGeometry(13, 4.6)), mat);
    msh.position.set(15, 5, -68);
    msh.visible = false;
    msh.userData = { id: 'backward-page', kind: 'secret' };
    root.add(msh);
    interactives.push(msh);
    updatables.push((t, _dt, cam) => {
      if (msh.visible) msh.lookAt(cam);
      mat.opacity = 0.7 + 0.25 * Math.sin(t * 2.1);
    });
    return msh;
  })();

  /* ---------- 4. SERVER GRAVEYARD ---------- */
  const ledMatRef: { mat: THREE.ShaderMaterial | null } = { mat: null };
  {
    const rand = rng(555);
    const count = Math.floor(150 * quality + 30);
    const geo = track(new THREE.BoxGeometry(9, 1, 9));
    const tints = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const actives = new Float32Array(count);
    const mat = track(new THREE.ShaderMaterial({
      uniforms: fogUniforms({ uTime: { value: 0 }, uWarm: { value: 0 } }),
      vertexShader: TOWER_VERT,
      fragmentShader: TOWER_FRAG,
      fog: true,
    }));
    const mesh = new THREE.InstancedMesh(geo, undefined as unknown as THREE.Material, count);
    mesh.material = mat;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const towerTops: Array<{ x: number; z: number; h: number }> = [];
    for (let i = 0; i < count; i++) {
      const x = (rand() - 0.5) * 300;
      const z = -430 - rand() * 470;
      const h = 26 + rand() * 95;
      if (Math.abs(x) < 26 && Math.abs(z - -695) < 60) { i--; continue; } // keep the corridor clear-ish
      m.compose(new THREE.Vector3(x, -60 + h / 2, z), q, s.set(1, h, 1));
      mesh.setMatrixAt(i, m);
      towerTops.push({ x, z, h });
      const roll = rand();
      const c = roll < 0.55 ? ASH : roll < 0.8 ? GREEN : roll < 0.93 ? CYAN : AMBER;
      tints[i * 3] = c.r; tints[i * 3 + 1] = c.g; tints[i * 3 + 2] = c.b;
      seeds[i] = rand();
      actives[i] = rand() < 0.4 ? 1 : 0;
    }
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geo.setAttribute('aActive', new THREE.InstancedBufferAttribute(actives, 1));
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
    updatables.push((t) => { mat.uniforms.uTime.value = t; });

    // ground slab
    const gmat = track(new THREE.MeshLambertMaterial({ color: 0x04080a }));
    const ground = new THREE.Mesh(track(new THREE.PlaneGeometry(1400, 700)), gmat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -60.5, -660);
    root.add(ground);

    // blinking LEDs on tower faces
    const ledCount = Math.floor(2200 * quality);
    const pos = new Float32Array(ledCount * 3);
    const size = new Float32Array(ledCount);
    const tint = new Float32Array(ledCount * 3);
    const seed = new Float32Array(ledCount);
    for (let i = 0; i < ledCount; i++) {
      const tw = towerTops[Math.floor(rand() * towerTops.length)];
      if (!tw) { i--; continue; }
      const face = Math.floor(rand() * 4);
      const off = 4.6;
      const px = face === 0 ? tw.x + off : face === 1 ? tw.x - off : tw.x + (rand() - 0.5) * 9;
      const pz = face === 2 ? tw.z + off : face === 3 ? tw.z - off : tw.z + (rand() - 0.5) * 9;
      pos[i * 3] = px;
      pos[i * 3 + 1] = -58 + rand() * (tw.h - 4);
      pos[i * 3 + 2] = pz;
      size[i] = 3 + rand() * 7;
      const roll = rand();
      const c = roll < 0.5 ? GREEN : roll < 0.8 ? CYAN : roll < 0.94 ? AMBER : BLOOD;
      tint[i * 3] = c.r; tint[i * 3 + 1] = c.g; tint[i * 3 + 2] = c.b;
      seed[i] = rand();
    }
    const lgeo = track(new THREE.BufferGeometry());
    lgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    lgeo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    lgeo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
    lgeo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const lmat = track(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: pixelScale * 0.7 }, uFar: { value: 550 } },
      vertexShader: `
        attribute float aSize; attribute vec3 aTint; attribute float aSeed;
        uniform float uTime; uniform float uScale; uniform float uFar;
        varying vec3 vTint; varying float vFade;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          float blink = step(0.45, fract(sin(aSeed * 999.0 + floor(uTime * (1.0 + aSeed * 3.0))) * 43.7));
          float steady = step(0.82, fract(aSeed * 17.0));
          float on = max(steady, blink);
          vTint = aTint * on;
          vFade = smoothstep(uFar, uFar * 0.2, -mv.z);
          gl_PointSize = clamp(aSize * uScale * on / max(1.0, -mv.z), 0.0, 22.0);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: POINTS_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    ledMatRef.mat = lmat;
    const leds = new THREE.Points(lgeo, lmat);
    leds.frustumCulled = false;
    root.add(leds);
    updatables.push((t) => { lmat.uniforms.uTime.value = t; });

    // fiber-optic cables
    for (let i = 0; i < 9; i++) {
      const a = towerTops[Math.floor(rand() * towerTops.length)];
      const b = towerTops[Math.floor(rand() * towerTops.length)];
      if (!a || !b || a === b) continue;
      const ya = -58 + a.h - 3;
      const yb = -58 + b.h - 3;
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(a.x, ya, a.z),
        new THREE.Vector3((a.x + b.x) / 2, Math.min(ya, yb) - 14 - rand() * 16, (a.z + b.z) / 2),
        new THREE.Vector3(b.x, yb, b.z),
      ]);
      const tube = new THREE.Mesh(
        track(new THREE.TubeGeometry(curve, 24, 0.28, 5, false)),
        track(new THREE.MeshBasicMaterial({ color: 0x0e3a40, transparent: true, opacity: 0.75 }))
      );
      root.add(tube);
    }

    // the warm server — something is still running here
    const warmTower = new THREE.Mesh(
      track(new THREE.BoxGeometry(10, 46, 10)),
      track(new THREE.MeshLambertMaterial({ color: 0x14100a, emissive: 0x2a1c08, emissiveIntensity: 0.7 }))
    );
    warmTower.position.set(30, -37, -695);
    warmTower.userData = { id: 'warm-server', kind: 'hot' };
    root.add(warmTower);
    interactives.push(warmTower);
    const warmFace = new THREE.Mesh(
      track(new THREE.PlaneGeometry(6, 8)),
      track(new THREE.MeshBasicMaterial({ color: 0xd9a441, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }))
    );
    warmFace.position.set(24.9, -40, -695);
    warmFace.rotation.y = -Math.PI / 2;
    root.add(warmFace);
    updatables.push((t) => {
      const pulse = 0.55 + 0.45 * Math.sin(t * 1.1);
      (warmFace.material as THREE.MeshBasicMaterial).opacity = 0.5 + 0.45 * pulse;
      warmLight.intensity = 240 + 180 * pulse;
    });

    // fog wisps
    const wispCanvas = document.createElement('canvas');
    wispCanvas.width = 128; wispCanvas.height = 128;
    const wg = wispCanvas.getContext('2d')!;
    const grad = wg.createRadialGradient(64, 64, 4, 64, 64, 62);
    grad.addColorStop(0, 'rgba(95,140,145,0.28)');
    grad.addColorStop(1, 'rgba(95,140,145,0)');
    wg.fillStyle = grad;
    wg.fillRect(0, 0, 128, 128);
    const wispTex = track(makeTexture(wispCanvas));
    for (let i = 0; i < 10; i++) {
      const sm = track(new THREE.SpriteMaterial({ map: wispTex, transparent: true, opacity: 0.16, depthWrite: false }));
      const sp = new THREE.Sprite(sm);
      const bx = (rand() - 0.5) * 240;
      const bz = -450 - rand() * 430;
      sp.position.set(bx, -45 + rand() * 30, bz);
      sp.scale.set(70 + rand() * 60, 26, 1);
      root.add(sp);
      updatables.push((t) => {
        if (reducedMotion) return;
        sp.position.x = bx + Math.sin(t * 0.05 + i) * 16;
        sm.opacity = 0.1 + 0.08 * Math.sin(t * 0.13 + i * 2.0);
      });
    }
  }

  /* ---------- the watcher in the graveyard (vanishes when looked at) ---------- */
  let watcherGoneFlag = false;
  let stareTime = 0;
  let watcherOpacity = 0.9;
  const watcher = (() => {
    const mat = track(new THREE.MeshBasicMaterial({ color: 0x010304, transparent: true, opacity: 0.9 }));
    const msh = new THREE.Mesh(track(new THREE.CapsuleGeometry(1.3, 4.2, 4, 10)), mat);
    msh.position.set(-42, -57, -738);
    root.add(msh);
    return msh;
  })();
  updatables.push((_t, dt, cam) => {
    if (watcherGoneFlag) return;
    const dirTo = watcher.position.clone().sub(cam).normalize();
    const facing = _lastCamDir.dot(dirTo);
    const dist = cam.distanceTo(watcher.position);
    if (facing > 0.965 && dist < 160) {
      stareTime += dt;
      if (stareTime > 0.55) {
        watcherGoneFlag = true;
        onWatcherGone();
      }
    } else {
      stareTime = Math.max(0, stareTime - dt * 2);
    }
    if (watcherGoneFlag) {
      watcherOpacity = Math.max(0, watcherOpacity - dt * 3.5);
      (watcher.material as THREE.MeshBasicMaterial).opacity = watcherOpacity;
      watcher.scale.setScalar(Math.max(0.001, watcherOpacity / 0.9));
      if (watcherOpacity <= 0.001) watcher.visible = false;
    }
  });

  /* ---------- 5. THE SOCIAL CITY ---------- */
  {
    const rand = rng(8080);
    const count = Math.floor(760 * quality);
    const geo = track(new THREE.BoxGeometry(1, 1, 1));
    const tints = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    const actives = new Float32Array(count);
    const mat = track(new THREE.ShaderMaterial({
      uniforms: fogUniforms({ uTime: { value: 0 } }),
      vertexShader: CITY_VERT,
      fragmentShader: CITY_FRAG,
      fog: true,
    }));
    const mesh = new THREE.InstancedMesh(geo, undefined as unknown as THREE.Material, count);
    mesh.material = mat;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const gx = Math.floor(rand() * 24) - 12;
      const gz = Math.floor(rand() * 34);
      const x = gx * 15 + (rand() - 0.5) * 5;
      const z = -940 - gz * 14 + (rand() - 0.5) * 5;
      if (Math.abs(x) < 16) { i--; continue; } // street for the camera
      const h = 8 + Math.pow(rand(), 2.2) * 88;
      const w = 5 + rand() * 7;
      m.compose(new THREE.Vector3(x, -30 + h / 2, z), q, s.set(w, h, w));
      mesh.setMatrixAt(i, m);
      const roll = rand();
      const c = roll < 0.62 ? AMBER : roll < 0.82 ? COLD : roll < 0.94 ? CYAN : ASH;
      tints[i * 3] = c.r * 0.9; tints[i * 3 + 1] = c.g * 0.9; tints[i * 3 + 2] = c.b * 0.9;
      seeds[i] = rand();
      actives[i] = rand() < 0.6 ? 1 : 0;
    }
    geo.setAttribute('aTint', new THREE.InstancedBufferAttribute(tints, 3));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geo.setAttribute('aActive', new THREE.InstancedBufferAttribute(actives, 1));
    mesh.instanceMatrix.needsUpdate = true;
    root.add(mesh);
    updatables.push((t, _dt, cam) => {
      mat.uniforms.uTime.value = t;
      const d = Math.abs(cam.z - -1160);
      cityLight.intensity = 750 * Math.max(0, 1 - d / 420);
    });

    // follower-graph roads
    const roadPos: number[] = [];
    for (let gx = -12; gx <= 12; gx++) {
      roadPos.push(gx * 15, -29.6, -935, gx * 15, -29.6, -1410);
    }
    for (let gz = 0; gz <= 34; gz++) {
      roadPos.push(-180, -29.6, -940 - gz * 14, 180, -29.6, -940 - gz * 14);
    }
    const rgeo = track(new THREE.BufferGeometry());
    rgeo.setAttribute('position', new THREE.Float32BufferAttribute(roadPos, 3));
    root.add(new THREE.LineSegments(rgeo, track(new THREE.LineBasicMaterial({
      color: 0xd9a441, transparent: true, opacity: 0.05, blending: THREE.AdditiveBlending, depthWrite: false,
    }))));

    // message signs
    const signTexts = [
      'user_7734', 'ARE YOU STILL THERE?', 'last seen 8,731 yrs ago', 'typing…',
      'STATUS: WAITING', '@ghost_of_2031', 'do you remember me', '❤ 4,209,113',
      'read 12.03.2029', 'new follower: null', 'is anyone', 'online?',
    ];
    for (let i = 0; i < 26; i++) {
      const txt = signTexts[i % signTexts.length];
      const amber = i % 3 === 0;
      const tex = track(makeTexture(textCanvas([txt], amber ? '#d9a441' : '#5fc9d4', 420, 80, '500 30px "IBM Plex Mono", monospace')));
      const sm = track(new THREE.MeshBasicMaterial({
        map: tex, transparent: true, opacity: 0.85, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const sign = new THREE.Mesh(track(new THREE.PlaneGeometry(16, 3.1)), sm);
      const side = i % 2 === 0 ? 1 : -1;
      sign.position.set(side * (20 + rand() * 90), -22 + rand() * 55, -950 - rand() * 440);
      sign.rotation.y = side > 0 ? -Math.PI / 2 - 0.2 : Math.PI / 2 + 0.2;
      root.add(sign);
      const ph = rand() * 8;
      updatables.push((t) => {
        sm.opacity = 0.5 + 0.4 * Math.sin(t * 0.9 + ph) * (Math.sin(t * 7.3 + ph) > -0.92 ? 1 : 0.1);
      });
    }

    // profile monuments
    for (let i = 0; i < 5; i++) {
      const tex = track(makeTexture(avatarCanvas(i * 3 + 1)));
      const side = i % 2 === 0 ? 1 : -1;
      const px = side * (46 + i * 14);
      const pz = -1000 - i * 82;
      const pedestal = new THREE.Mesh(
        track(new THREE.BoxGeometry(12, 26, 12)),
        track(new THREE.MeshLambertMaterial({ color: 0x0a0d10, emissive: 0x0a1214, emissiveIntensity: 0.4 }))
      );
      pedestal.position.set(px, -17, pz);
      root.add(pedestal);
      const face = new THREE.Mesh(
        track(new THREE.PlaneGeometry(11, 11)),
        track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }))
      );
      face.position.set(px, 2, pz);
      face.userData = { id: 'monument', kind: 'monument' };
      root.add(face);
      interactives.push(face);
      updatables.push((t) => {
        face.position.y = 2 + (reducedMotion ? 0 : Math.sin(t * 0.5 + i) * 1.2);
        face.rotation.y = t * 0.12 + i;
      });
    }
  }

  /* ---------- 6. MEMORY OCEAN ---------- */
  {
    const geo = track(new THREE.PlaneGeometry(950, 760, 110, 90));
    const mat = track(new THREE.ShaderMaterial({
      uniforms: fogUniforms({ uTime: { value: 0 } }),
      vertexShader: OCEAN_VERT,
      fragmentShader: OCEAN_FRAG,
      fog: true,
    }));
    const ocean = new THREE.Mesh(geo, mat);
    ocean.rotation.x = -Math.PI / 2;
    ocean.position.set(0, -36, -1660);
    root.add(ocean);
    updatables.push((t) => { mat.uniforms.uTime.value = reducedMotion ? 40 : t; });

    // floating memories (instanced, atlas-sampled)
    const atlasTex = track(makeTexture(memoryAtlas()));
    const count = Math.floor(150 * quality);
    const pgeo = track(new THREE.PlaneGeometry(6.4, 6.4));
    const offs = new Float32Array(count * 2);
    const seeds = new Float32Array(count);
    const rand = rng(424242);
    for (let i = 0; i < count; i++) {
      offs[i * 2] = Math.floor(rand() * 4) * 0.25;
      offs[i * 2 + 1] = Math.floor(rand() * 4) * 0.25;
      seeds[i] = rand();
    }
    pgeo.setAttribute('aUvOff', new THREE.InstancedBufferAttribute(offs, 2));
    pgeo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    const pmat = track(new THREE.ShaderMaterial({
      uniforms: { uMap: { value: atlasTex }, uTime: { value: 0 }, uCam: { value: new THREE.Vector3() } },
      vertexShader: `
        attribute vec2 aUvOff;
        attribute float aSeed;
        uniform float uTime;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vUv = uv * 0.25 + aUvOff;
          vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
          wp.y += sin(uTime * 0.5 + aSeed * 20.0) * 2.2;
          wp.x += cos(uTime * 0.3 + aSeed * 14.0) * 1.4;
          vec4 mvPosition = viewMatrix * wp;
          vFade = smoothstep(520.0, 120.0, -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }`,
      fragmentShader: `
        uniform sampler2D uMap;
        varying vec2 vUv;
        varying float vFade;
        void main() {
          vec4 tex = texture2D(uMap, vUv);
          float a = tex.a * (0.55 + 0.45 * vFade);
          if (a < 0.02) discard;
          gl_FragColor = vec4(tex.rgb * (0.7 + 0.6 * vFade), a);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
    }));
    const mesh = new THREE.InstancedMesh(pgeo, undefined as unknown as THREE.Material, count);
    mesh.material = pmat;
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    const s = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      e.set((rand() - 0.5) * 0.5, rand() * Math.PI * 2, (rand() - 0.5) * 0.4);
      q.setFromEuler(e);
      const sc = 0.5 + rand() * 1.1;
      m.compose(
        new THREE.Vector3((rand() - 0.5) * 420, -26 + rand() * 34, -1460 - rand() * 420),
        q, s.set(sc, sc, sc)
      );
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.frustumCulled = false;
    root.add(mesh);
    updatables.push((t, _d, cam) => {
      pmat.uniforms.uTime.value = reducedMotion ? 30 : t;
      (pmat.uniforms.uCam.value as THREE.Vector3).copy(cam);
    });
  }

  /* ---------- 7. THE AI ZONE ---------- */
  const entities: THREE.Mesh[] = [];
  {
    const rand = rng(9001);
    const count = Math.floor(4200 * quality);
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const tint = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const nodes: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      const layer = Math.floor(rand() * 5);
      const v = new THREE.Vector3(
        (rand() - 0.5) * 460,
        40 + layer * 32 + (rand() - 0.5) * 24,
        -1960 - rand() * 420
      );
      nodes.push(v);
      pos[i * 3] = v.x; pos[i * 3 + 1] = v.y; pos[i * 3 + 2] = v.z;
      size[i] = 5 + rand() * 15;
      const roll = rand();
      const c = roll < 0.55 ? CYAN : roll < 0.78 ? COLD : roll < 0.92 ? BLOOD : GREEN;
      const dim = 0.4 + rand() * 0.6;
      tint[i * 3] = c.r * dim; tint[i * 3 + 1] = c.g * dim; tint[i * 3 + 2] = c.b * dim;
      seed[i] = rand();
    }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    geo.setAttribute('aTint', new THREE.BufferAttribute(tint, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = track(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: pixelScale }, uPulse: { value: 0 } },
      vertexShader: NEURAL_VERT,
      fragmentShader: POINTS_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    root.add(pts);

    // synapse lines
    const linePos: number[] = [];
    for (let i = 0; i < Math.floor(560 * quality); i++) {
      const a = nodes[Math.floor(rand() * nodes.length)];
      const b = nodes[Math.floor(rand() * nodes.length)];
      if (!a || !b || a === b) continue;
      if (a.distanceTo(b) > 130) continue;
      linePos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    }
    const sgeo = track(new THREE.BufferGeometry());
    sgeo.setAttribute('position', new THREE.Float32BufferAttribute(linePos, 3));
    root.add(new THREE.LineSegments(sgeo, track(new THREE.LineBasicMaterial({
      color: 0x8a3a4e, transparent: true, opacity: 0.06, blending: THREE.AdditiveBlending, depthWrite: false,
    }))));

    updatables.push((t, _dt, cam) => {
      mat.uniforms.uTime.value = reducedMotion ? 20 : t;
      const d = Math.abs(cam.z - -2160);
      mat.uniforms.uPulse.value = Math.max(0, 1 - d / 380);
      aiLight.intensity = 300 * Math.max(0, 1 - d / 420);
    });

    // ancient entities
    const shapes: Array<[number, number, number, number, number]> = [
      [-90, 105, -2080, 62, 1], [110, 75, -2230, 84, 2], [0, 150, -2330, 55, 1],
    ];
    shapes.forEach(([x, y, z, r, detail], idx) => {
      const g = track(new THREE.IcosahedronGeometry(r, detail));
      const isAnomaly = idx === 1;
      const mtr = track(new THREE.MeshBasicMaterial({
        color: isAnomaly ? 0xd8465e : 0x2a6a72,
        wireframe: true, transparent: true, opacity: isAnomaly ? 0.2 : 0.14,
        blending: THREE.AdditiveBlending, depthWrite: false,
      }));
      const msh = new THREE.Mesh(g, mtr);
      msh.position.set(x, y, z);
      root.add(msh);
      entities.push(msh);
      const ph = idx * 2.1;
      updatables.push((t) => {
        if (!reducedMotion) {
          msh.rotation.x = t * 0.02 + ph;
          msh.rotation.y = t * 0.027 + ph;
        }
        const br = 1 + 0.05 * Math.sin(t * 0.4 + ph);
        msh.scale.setScalar(br);
        mtr.opacity = (isAnomaly ? 0.2 : 0.14) * (0.7 + 0.3 * Math.sin(t * 0.6 + ph));
      });
    });
  }

  /* ---------- 8. THE FINAL SERVER ---------- */
  const revealState = { v: 0 };
  let crowdMat: THREE.MeshBasicMaterial | null = null;
  let silhouetteMat: THREE.MeshBasicMaterial | null = null;
  let serverFaceMat: THREE.MeshBasicMaterial | null = null;
  {
    const wallMat = track(new THREE.MeshLambertMaterial({ color: 0x05080b }));
    const wallGeo = track(new THREE.BoxGeometry(14, 90, 18));
    for (let i = 0; i < 11; i++) {
      const z = -2470 - i * 24;
      for (const sx of [-30, 30]) {
        const w = new THREE.Mesh(wallGeo, wallMat);
        w.position.set(sx, -45, z);
        root.add(w);
      }
    }
    // the server itself
    const serverBox = new THREE.Mesh(
      track(new THREE.BoxGeometry(12, 20, 12)),
      track(new THREE.MeshLambertMaterial({ color: 0x0a0e11, emissive: 0x11161a, emissiveIntensity: 0.6 }))
    );
    serverBox.position.set(0, -70, -2682);
    root.add(serverBox);
    serverFaceMat = track(new THREE.MeshBasicMaterial({
      color: 0xe4f1f2, transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false,
    }));
    const face = new THREE.Mesh(track(new THREE.PlaneGeometry(7, 12)), serverFaceMat);
    face.position.set(0, -70, -2675.8);
    root.add(face);
    const labelTex = track(makeTexture(textCanvas(['NODE 000', 'ORIGIN'], '#e4f1f2', 220, 120, '400 34px "IBM Plex Mono", monospace')));
    const label = new THREE.Sprite(track(new THREE.SpriteMaterial({
      map: labelTex, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false,
    })));
    label.position.set(0, -56, -2680);
    label.scale.set(12, 6.5, 1);
    root.add(label);

    // slow dust in the chamber
    const dCount = Math.floor(900 * quality);
    const dPos = new Float32Array(dCount * 3);
    const dSize = new Float32Array(dCount);
    const dTint = new Float32Array(dCount * 3);
    const dSeed = new Float32Array(dCount);
    const rand = rng(1234);
    for (let i = 0; i < dCount; i++) {
      dPos[i * 3] = (rand() - 0.5) * 70;
      dPos[i * 3 + 1] = -95 + rand() * 60;
      dPos[i * 3 + 2] = -2450 - rand() * 260;
      dSize[i] = 3 + rand() * 8;
      dTint[i * 3] = 0.75; dTint[i * 3 + 1] = 0.85; dTint[i * 3 + 2] = 0.88;
      dSeed[i] = rand();
    }
    const dGeo = track(new THREE.BufferGeometry());
    dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
    dGeo.setAttribute('aSize', new THREE.BufferAttribute(dSize, 1));
    dGeo.setAttribute('aTint', new THREE.BufferAttribute(dTint, 3));
    dGeo.setAttribute('aSeed', new THREE.BufferAttribute(dSeed, 1));
    const dMat = track(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uScale: { value: pixelScale * 0.5 }, uFar: { value: 420 } },
      vertexShader: POINTS_VERT,
      fragmentShader: POINTS_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    const dust = new THREE.Points(dGeo, dMat);
    dust.frustumCulled = false;
    root.add(dust);
    updatables.push((t, _d, cam) => {
      dMat.uniforms.uTime.value = reducedMotion ? 10 : t * 0.35;
      const near = Math.max(0, 1 - cam.distanceTo(new THREE.Vector3(0, -70, -2676)) / 260);
      serverLight.intensity = 520 * near * (0.8 + 0.2 * Math.sin(t * 0.8));
      if (serverFaceMat) serverFaceMat.opacity = near * (0.55 + 0.3 * Math.sin(t * 1.4));
    });

    // the silhouette — the previous visitor
    silhouetteMat = track(new THREE.MeshBasicMaterial({ color: 0x010203, transparent: true, opacity: 0 }));
    const sil = new THREE.Mesh(track(new THREE.CapsuleGeometry(1.5, 5.4, 4, 12)), silhouetteMat);
    sil.position.set(0, -79, -2574);
    root.add(sil);
    const rim = new THREE.PointLight(0xbfe8ec, 0, 90, 1.6);
    rim.position.set(0, -70, -2556);
    root.add(rim);

    // the crowd — thousands of visitors, all still here
    crowdMat = track(new THREE.MeshBasicMaterial({ color: 0x020407, transparent: true, opacity: 0 }));
    const cCount = Math.floor(1500 * quality + 300);
    const cGeo = track(new THREE.CapsuleGeometry(1.2, 4.4, 3, 7));
    const crowd = new THREE.InstancedMesh(cGeo, crowdMat, cCount);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    for (let i = 0; i < cCount; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = 30 + Math.pow(rand(), 0.6) * 330;
      const x = Math.sin(ang) * rad;
      const z = -2640 - Math.cos(ang) * rad * 0.8;
      e.set(0, rand() * Math.PI * 2, 0);
      q.setFromEuler(e);
      const sc = 0.8 + rand() * 0.5;
      m.compose(new THREE.Vector3(x, -81 + rand() * 2, z), q, s.set(sc, sc, sc));
      crowd.setMatrixAt(i, m);
    }
    crowd.instanceMatrix.needsUpdate = true;
    crowd.frustumCulled = false;
    root.add(crowd);

    updatables.push(() => {
      const v = revealState.v;
      if (silhouetteMat) silhouetteMat.opacity = Math.min(1, v * 2.2);
      if (crowdMat) crowdMat.opacity = Math.max(0, (v - 0.35) / 0.65);
      rim.intensity = 380 * Math.min(1, v * 2);
    });
  }

  /* ---------- guided path stream ---------- */
  const guideMatRef: { mat: THREE.ShaderMaterial | null } = { mat: null };
  let guidePts: THREE.Points | null = null;
  {
    const count = 620;
    const pos = new Float32Array(count * 3);
    const aS = new Float32Array(count);
    const seed = new Float32Array(count);
    const rand = rng(6161);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      const s = 0.1 + (i / count) * 0.83;
      samplePath(s, v);
      pos[i * 3] = v.x + (rand() - 0.5) * 10;
      pos[i * 3 + 1] = v.y + (rand() - 0.5) * 8 - 4;
      pos[i * 3 + 2] = v.z + (rand() - 0.5) * 10;
      aS[i] = s;
      seed[i] = rand();
    }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aS', new THREE.BufferAttribute(aS, 1));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    const mat = track(new THREE.ShaderMaterial({
      uniforms: { uP: { value: 0 }, uTime: { value: 0 }, uScale: { value: pixelScale * 0.8 } },
      vertexShader: GUIDE_VERT,
      fragmentShader: GUIDE_FRAG,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    guideMatRef.mat = mat;
    guidePts = new THREE.Points(geo, mat);
    guidePts.frustumCulled = false;
    guidePts.visible = false;
    root.add(guidePts);
    updatables.push((t, _d, _c, p) => {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uP.value = p;
      guidePts!.visible = p > 0.13 && p < 0.92;
    });
  }

  /* ---------- entry burst ---------- */
  let burstPts: THREE.Points | null = null;
  let burstMat: THREE.ShaderMaterial | null = null;
  let burstT = -1;
  {
    const count = Math.floor(15000 * quality);
    const from = new Float32Array(count * 3);
    const to = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    const rand = rng(8888);
    const origin = new THREE.Vector3(0, 2, 6);
    for (let i = 0; i < count; i++) {
      from[i * 3] = origin.x + (rand() - 0.5) * 3;
      from[i * 3 + 1] = origin.y + (rand() - 0.5) * 3;
      from[i * 3 + 2] = origin.z + (rand() - 0.5) * 3;
      const dir = new THREE.Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).normalize();
      dir.z -= 0.55; // bias forward into the universe
      dir.normalize();
      const dist = 60 + Math.pow(rand(), 1.6) * 480;
      to[i * 3] = origin.x + dir.x * dist;
      to[i * 3 + 1] = origin.y + dir.y * dist * 0.7;
      to[i * 3 + 2] = origin.z + dir.z * dist;
      seed[i] = rand();
    }
    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(from, 3));
    geo.setAttribute('aTo', new THREE.BufferAttribute(to, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    burstMat = track(new THREE.ShaderMaterial({
      uniforms: { uProg: { value: 0 }, uScale: { value: pixelScale } },
      vertexShader: BURST_VERT,
      fragmentShader: `
        varying float vA; varying vec3 vTint;
        void main() {
          vec2 c = gl_PointCoord - 0.5;
          float d = length(c);
          float a = smoothstep(0.5, 0.0, d) * vA;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vTint, a);
        }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    burstPts = new THREE.Points(geo, burstMat);
    burstPts.frustumCulled = false;
    burstPts.visible = false;
    root.add(burstPts);
    updatables.push((t) => {
      if (burstT < 0 || !burstMat || !burstPts) return;
      const e = (t - burstT) / 3.4;
      if (e >= 1) {
        burstPts.visible = false;
        burstT = -1;
        return;
      }
      burstMat.uniforms.uProg.value = Math.max(0, e);
    });
  }

  /* ---------- one-frame flash apparition ---------- */
  let flashFrames = 0;
  const flashSprite = (() => {
    const c = document.createElement('canvas');
    c.width = 64; c.height = 128;
    const g = c.getContext('2d')!;
    g.fillStyle = '#010304';
    g.beginPath();
    g.ellipse(32, 22, 12, 14, 0, 0, Math.PI * 2);
    g.fill();
    g.fillRect(18, 34, 28, 70);
    const tex = track(makeTexture(c));
    const mat = track(new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.95, depthWrite: false }));
    const sp = new THREE.Sprite(mat);
    sp.scale.set(7, 14, 1);
    sp.visible = false;
    root.add(sp);
    return sp;
  })();

  const _lastCamDir = new THREE.Vector3(0, 0, -1);
  let lastTime = 0;

  const handles: WorldHandles = {
    root,
    watcherGone: false,
    interactives,
    update(t, dt, cam, camDir, p, _backward) {
      lastTime = t;
      _lastCamDir.copy(camDir);
      for (const u of updatables) u(t, dt, cam, p);
      handles.watcherGone = watcherGoneFlag;
    },
    burst() {
      if (burstPts && burstMat) {
        burstPts.visible = true;
        burstMat.uniforms.uProg.value = 0;
        burstT = lastTime;
      }
    },
    setReveal(v) {
      revealState.v = THREE.MathUtils.clamp(v, 0, 1);
    },
    setBackwardPage(v) {
      backwardPage.visible = v;
    },
    flashAt(v) {
      flashSprite.position.copy(v);
      flashSprite.visible = true;
      flashFrames = 2;
      setTimeout(() => {
        flashFrames -= 1;
        if (flashFrames <= 0) flashSprite.visible = false;
      }, 50);
    },
    dispose() {
      scene.remove(root);
      for (const d of disposables) d.dispose();
    },
  };

  // keep mat refs referenced (avoids unused-var lint)
  void ledMatRef;
  void guideMatRef;

  return handles;
}
