/* THE LAST INTERNET — core engine.
   Renderer + camera choreography + scroll timeline + interaction + horror.
   The scroll is the camera. The camera is the visitor's body. */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { AudioSystem, type RegionId } from './audio';
import { BehaviorTracker, type TrackerSnapshot } from './tracker';
import { buildWorld, type WorldHandles } from './world';
import {
  atmosAt, cameraAt, regionAt, STORY_CUES, type CueKind,
} from './timeline';

export type EnginePhase = 'idle' | 'experience' | 'terminal' | 'reveal' | 'end';

export interface CueEvent {
  id: string;
  text: string;
  kind: CueKind;
}

export interface EngineCallbacks {
  onCue: (cue: CueEvent) => void;
  onPhase: (phase: EnginePhase) => void;
  onRegion: (name: string, id: RegionId) => void;
  onStats: (s: TrackerSnapshot & { p: number }) => void;
  onHover: (hovering: boolean, id?: string) => void;
}

const FINAL_SHADER = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uGrain: { value: 0.08 },
    uScan: { value: 0.2 },
    uChroma: { value: 0.2 },
    uGlitch: { value: 0 },
    uVignette: { value: 0.55 },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uGrain;
    uniform float uScan;
    uniform float uChroma;
    uniform float uGlitch;
    uniform float uVignette;
    uniform vec2 uRes;
    varying vec2 vUv;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }
    void main() {
      vec2 uv = vUv;
      if (uGlitch > 0.003) {
        float row = floor(uv.y * 90.0);
        float rnd = hash(vec2(row, floor(uTime * 17.0)));
        float shift = (rnd - 0.5) * uGlitch * 0.1 * step(0.72, rnd);
        uv.x += shift;
        float block = step(0.99, hash(vec2(floor(uTime * 8.0), 4.7)));
        uv.x += block * uGlitch * 0.05 * sin(uv.y * 37.0);
      }
      vec2 c = uv - 0.5;
      float d2 = dot(c, c);
      vec2 off = c * d2 * uChroma * 0.08;
      float r = texture2D(tDiffuse, uv + off).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - off).b;
      vec3 col = vec3(r, g, b);
      float sl = 0.5 + 0.5 * sin(vUv.y * uRes.y * 1.35 + uTime * 6.0);
      col *= 1.0 - uScan * 0.16 * sl;
      col *= 1.0 - uVignette * d2 * 1.9;
      float n = hash(vUv * (uTime * 57.0 + 3.1));
      col += (n - 0.5) * uGrain * 0.4;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export class LastInternetEngine {
  private container: HTMLElement;
  private cb: EngineCallbacks;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private finalPass: ShaderPass;
  private world: WorldHandles;
  private audio: AudioSystem;
  private tracker: BehaviorTracker;

  private clock = new THREE.Clock();
  private raf = 0;
  private disposed = false;
  private reducedMotion: boolean;

  private p = 0;
  private targetP = 0;
  private velocity = 0;
  private phase: EnginePhase = 'idle';
  private scrollLocked = true;

  private mouseX = 0;
  private mouseY = 0;
  private parX = 0;
  private parY = 0;
  private glitchBoost = 0;
  private lastStatsAt = 0;
  private lastRayAt = 0;
  private rayHoverId: string | null = null;
  private firedCues = new Set<string>();
  private cueQueue: CueEvent[] = [];
  private lastCueAt = 0;
  private flags = new Set<string>();
  private dwellFlag: Partial<Record<RegionId, boolean>> = {};
  private prevP = 0;
  private revealStart = -1;
  private autoRevealAt = -1;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private degraded = false;

  private camPos = new THREE.Vector3(0, 2, 8);
  private camLook = new THREE.Vector3(0, 2, -120);
  private camDir = new THREE.Vector3(0, 0, -1);
  private right = new THREE.Vector3(1, 0, 0);
  private tmpA = new THREE.Vector3();
  private tmpB = new THREE.Vector3();
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2(0, 0);
  private fogColor = new THREE.Color(0x000000);

  private onWheelBound = (e: WheelEvent) => this.onWheel(e);
  private onTouchStartBound = (e: TouchEvent) => this.onTouchStart(e);
  private onTouchMoveBound = (e: TouchEvent) => this.onTouchMove(e);
  private onKeyBound = (e: KeyboardEvent) => this.onKey(e);
  private onPointerBound = (e: PointerEvent) => this.onPointer(e);
  private onResizeBound = () => this.onResize();
  private touchY = 0;

  constructor(container: HTMLElement, cb: EngineCallbacks) {
    this.container = container;
    this.cb = cb;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const isSmall = Math.min(window.screen.width, window.screen.height) < 760;
    const quality = isSmall ? 0.55 : 1;

    this.renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isSmall ? 1.25 : 1.5));
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.display = 'block';

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x000000, 0.028);

    this.camera = new THREE.PerspectiveCamera(
      60, container.clientWidth / Math.max(1, container.clientHeight), 0.1, 2400
    );
    this.camera.position.copy(this.camPos);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(container.clientWidth, container.clientHeight), 0.6, 0.75, 0.12
    );
    this.composer.addPass(this.bloomPass);
    this.composer.addPass(new OutputPass());
    this.finalPass = new ShaderPass(FINAL_SHADER);
    (this.finalPass.uniforms.uRes.value as THREE.Vector2).set(
      container.clientWidth * this.renderer.getPixelRatio(),
      container.clientHeight * this.renderer.getPixelRatio()
    );
    this.composer.addPass(this.finalPass);

    this.audio = new AudioSystem();
    this.tracker = new BehaviorTracker();

    this.world = buildWorld(this.scene, quality, this.reducedMotion, () => {
      this.pushCue({ id: 'watcher-gone', text: 'IT WAS JUST THERE.', kind: 'anomaly' });
      this.audio.duck(2500);
      this.pulseGlitch(0.7);
    });

    window.addEventListener('wheel', this.onWheelBound, { passive: true });
    window.addEventListener('touchstart', this.onTouchStartBound, { passive: true });
    window.addEventListener('touchmove', this.onTouchMoveBound, { passive: true });
    window.addEventListener('keydown', this.onKeyBound);
    window.addEventListener('pointermove', this.onPointerBound, { passive: true });
    window.addEventListener('resize', this.onResizeBound);

    this.clock.start();
    this.loop();
  }

  /* ------------------------- public API ------------------------- */

  enter(): void {
    if (this.phase !== 'idle') return;
    this.phase = 'experience';
    this.scrollLocked = false;
    this.autoRevealAt = this.clock.getElapsedTime() + 0.35;
    this.tracker.begin();
    this.audio.start();
    this.audio.burst();
    this.world.burst();
    this.pulseGlitch(this.reducedMotion ? 0.2 : 1.0);
    this.cb.onPhase('experience');
    this.cb.onRegion('SIGNAL VOID', 'void');
  }

  beginReveal(): void {
    if (this.phase !== 'terminal') return;
    this.phase = 'reveal';
    this.revealStart = this.clock.getElapsedTime();
    this.cb.onPhase('reveal');
    this.audio.duck(9000);
    this.pulseGlitch(this.reducedMotion ? 0.25 : 0.9);
  }

  reset(): void {
    this.p = 0.09;
    this.targetP = 0.09;
    this.prevP = 0.09;
    this.phase = 'experience';
    this.scrollLocked = false;
    this.revealStart = -1;
    this.firedCues.clear();
    this.cueQueue = [];
    this.flags.clear();
    this.dwellFlag = {};
    this.tracker.reset();
    this.world.setReveal(0);
    this.world.setBackwardPage(false);
    this.audio.start();
    this.cb.onPhase('experience');
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('wheel', this.onWheelBound);
    window.removeEventListener('touchstart', this.onTouchStartBound);
    window.removeEventListener('touchmove', this.onTouchMoveBound);
    window.removeEventListener('keydown', this.onKeyBound);
    window.removeEventListener('pointermove', this.onPointerBound);
    window.removeEventListener('resize', this.onResizeBound);
    this.world.dispose();
    this.audio.dispose();
    this.composer.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }

  /* ------------------------- input ------------------------- */

  private onWheel(e: WheelEvent): void {
    if (this.phase !== 'experience' || this.scrollLocked) return;
    const d = THREE.MathUtils.clamp(e.deltaY, -160, 160) * 0.00031;
    this.nudge(d);
  }

  private onTouchStart(e: TouchEvent): void {
    this.touchY = e.touches[0]?.clientY ?? 0;
  }

  private onTouchMove(e: TouchEvent): void {
    if (this.phase !== 'experience' || this.scrollLocked) return;
    const y = e.touches[0]?.clientY ?? 0;
    const dy = this.touchY - y;
    this.touchY = y;
    this.nudge(dy * 0.0011);
  }

  private onKey(e: KeyboardEvent): void {
    if (this.phase !== 'experience' || this.scrollLocked) return;
    if (e.key === 'ArrowDown' || e.key === ' ' || e.key === 'PageDown') this.nudge(0.028);
    else if (e.key === 'ArrowUp' || e.key === 'PageUp') this.nudge(-0.028);
  }

  private nudge(d: number): void {
    this.targetP = THREE.MathUtils.clamp(this.targetP + d, 0, 1);
    this.tracker.onScrollDelta(d);
  }

  private onPointer(e: PointerEvent): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.mouseX = (e.clientX / w) * 2 - 1;
    this.mouseY = -((e.clientY / h) * 2 - 1);
    this.ndc.set(this.mouseX, this.mouseY);
    this.tracker.markInput();
  }

  private onResize(): void {
    const w = this.container.clientWidth;
    const h = Math.max(1, this.container.clientHeight);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    this.composer.setSize(w, h);
    (this.finalPass.uniforms.uRes.value as THREE.Vector2).set(
      w * this.renderer.getPixelRatio(), h * this.renderer.getPixelRatio()
    );
  }

  /* ------------------------- cues ------------------------- */

  private pushCue(cue: CueEvent): void {
    if (this.firedCues.has(cue.id)) return;
    this.firedCues.add(cue.id);
    this.cueQueue.push(cue);
  }

  private drainCues(t: number): void {
    if (this.cueQueue.length === 0) return;
    if (t - this.lastCueAt < 2.1) return;
    const cue = this.cueQueue.shift()!;
    this.lastCueAt = t;
    if (cue.kind === 'visitor') this.audio.duck(3400);
    if (cue.kind === 'anomaly') this.pulseGlitch(this.reducedMotion ? 0.15 : 0.5);
    this.cb.onCue(cue);
  }

  private pulseGlitch(v: number): void {
    if (this.reducedMotion) v *= 0.35;
    this.glitchBoost = Math.max(this.glitchBoost, v);
  }

  /* ------------------------- story logic ------------------------- */

  private storyTick(t: number, dt: number): void {
    const p = this.p;

    // timeline cues
    for (const cue of STORY_CUES) {
      if (p >= cue.at && !this.firedCues.has(cue.id)) {
        this.pushCue({ id: cue.id, text: cue.text, kind: cue.kind });
      }
    }

    // easter egg: the backward-only page
    this.world.setBackwardPage(this.tracker.backwardCount > 0 && p < 0.3);

    // one-frame apparition crossing into the city border
    if (this.prevP < 0.465 && p >= 0.465 && !this.flags.has('flash1')) {
      this.flags.add('flash1');
      this.tmpA.copy(this.camPos).addScaledVector(this.right, 20).addScaledVector(this.camDir, 34);
      this.tmpA.y -= 6;
      this.world.flashAt(this.tmpA);
    }

    // ---- direct address: only truths from this session ----
    const idle = this.tracker.idleSeconds();
    if (idle > 30 && !this.flags.has('idle1') && p > 0.12 && p < 0.9) {
      this.flags.add('idle1');
      this.pushCue({ id: 'idle1', text: 'TAKE YOUR TIME.', kind: 'visitor' });
    }
    if (idle > 65 && !this.flags.has('idle2') && p > 0.12 && p < 0.9) {
      this.flags.add('idle2');
      this.pushCue({ id: 'idle2', text: "I CAN WAIT. I'VE WAITED 8,731 YEARS.", kind: 'visitor' });
    }

    const mins = this.tracker.sessionMinutes();
    if (p > 0.55 && !this.flags.has('minutes') && mins >= 0.4) {
      this.flags.add('minutes');
      const m = Math.max(1, Math.floor(mins));
      this.pushCue({
        id: 'minutes',
        text: `YOU'VE BEEN HERE FOR ${m} MINUTE${m === 1 ? '' : 'S'}.`,
        kind: 'visitor',
      });
    }

    if (p > 0.68 && this.tracker.backwardCount >= 4 && !this.flags.has('backn')) {
      this.flags.add('backn');
      this.pushCue({
        id: 'backn',
        text: `YOU SCROLLED BACK ${this.tracker.backwardCount} TIMES.`,
        kind: 'visitor',
      });
    }
    if (this.tracker.backwardCount === 3 && p < 0.55 && !this.flags.has('backwhy')) {
      this.flags.add('backwhy');
      this.pushCue({ id: 'backwhy', text: 'WHY ARE YOU TRYING TO GO BACK?', kind: 'visitor' });
    }

    const region = this.tracker.currentRegion;
    if (p > 0.12 && p < 0.9 && !this.dwellFlag[region] && this.tracker.regionClockSeconds() > 55) {
      this.dwellFlag[region] = true;
      this.pushCue({
        id: `dwell-${region}`,
        text: `YOU'VE BEEN IN ${regionName(region)} FOR ${this.tracker.regionClock()}.`,
        kind: 'visitor',
      });
    }

    // the terminal
    if (p >= 0.955 && this.phase === 'experience') {
      this.phase = 'terminal';
      this.scrollLocked = true;
      this.audio.duck(7000);
      this.cb.onPhase('terminal');
    }

    // hover semantics
    if (this.rayHoverId) this.tracker.markHover(this.rayHoverId, dt);
    if (this.rayHoverId === 'warm-server') {
      const s = this.tracker.hoverSeconds('warm-server');
      if (s > 4 && !this.flags.has('warmline')) {
        this.flags.add('warmline');
        this.pushCue({
          id: 'warmline',
          text: `YOU LOOKED AT THE SERVER FOR ${s.toFixed(1)} SECONDS. IT IS STILL WARM.`,
          kind: 'visitor',
        });
      }
    }

    void t;
  }

  private hoverTick(t: number): void {
    if (t - this.lastRayAt < 0.12 || this.phase === 'idle') return;
    this.lastRayAt = t;
    this.raycaster.setFromCamera(this.ndc, this.camera);
    const hits = this.raycaster.intersectObjects(this.world.interactives, false);
    const first = hits.find((h) => h.object.visible);
    const hit = first ? first.object : null;
    const id = hit ? (hit.userData.id as string) : null;
    if (id !== this.rayHoverId) {
      // leaving something
      if (this.rayHoverId === 'watch-page' && !this.flags.has('page1')) {
        this.flags.add('page1');
        this.pushCue({ id: 'page1', text: 'THE PAGE NOTICED YOU.', kind: 'echo' });
      }
      if (this.rayHoverId === 'monument' && !this.flags.has('mon1')) {
        this.flags.add('mon1');
        this.pushCue({ id: 'mon1', text: 'user_4471 — LAST LOGIN: 8,731 YEARS AGO', kind: 'echo' });
      }
      if (this.rayHoverId === 'backward-page' && !this.flags.has('backpage')) {
        this.flags.add('backpage');
        this.pushCue({ id: 'backpage', text: 'IT REMEMBERS BEING VISITED.', kind: 'echo' });
        this.audio.guide();
      }
      this.rayHoverId = id;
      if (id && this.tracker.firstHover(id)) this.tracker.markInput();
      this.cb.onHover(!!id, id ?? undefined);
    }
  }

  /* ------------------------- frame loop ------------------------- */

  private loop = (): void => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    const t = this.clock.getElapsedTime();

    if (this.phase === 'experience' || this.phase === 'terminal') {
      // cinematic auto pull-back right after ENTER, then scroll owns the timeline
      if (this.autoRevealAt >= 0) {
        const e = (t - this.autoRevealAt) / 6.8;
        if (e >= 1) {
          this.autoRevealAt = -1;
        } else if (e > 0) {
          const c = smoothstep(e) * 0.088;
          this.targetP = Math.max(this.targetP, c);
          this.p = Math.max(this.p, c * 0.92);
        }
      }
      // smooth scroll → film timeline
      const prev = this.p;
      this.p += (this.targetP - this.p) * Math.min(1, dt * 2.6);
      this.velocity = (this.p - prev) / Math.max(dt, 0.0001);

      const region = regionAt(this.p);
      this.audio.setRegion(region.id);
      this.tracker.tick(dt, this.p, region.id, this.velocity);

      this.updateCamera(dt, t);
      this.world.update(t, dt, this.camPos, this.camDir, this.p, this.velocity < -0.001);
      this.applyAtmos(this.p, dt);
      if (this.phase === 'experience') this.storyTick(t, dt);
      this.hoverTick(t);

      // proximity hum near living things
      const prox = Math.max(
        gauss(this.p, 0.41, 0.035),
        gauss(this.p, 0.97, 0.03) * 0.8
      );
      this.audio.setProximity(prox);

      if (t - this.lastStatsAt > 0.35) {
        this.lastStatsAt = t;
        const snap = this.tracker.snapshot();
        const r = regionAt(this.p);
        this.cb.onStats({ ...snap, region: r.id, p: this.p });
        if (r.id !== this.tracker.currentRegion) {
          // region display follows camera even before tracker switches
        }
        if (this.lastRegionId !== r.id) {
          this.lastRegionId = r.id;
          this.cb.onRegion(r.name, r.id);
        }
      }
      this.prevP = this.p;
    } else if (this.phase === 'reveal') {
      this.updateReveal(t, dt);
      this.applyAtmos(0.985, dt, true);
    } else if (this.phase === 'end') {
      // slow eternal pull-back
      this.camPos.y += dt * 1.2;
      this.camPos.z += dt * 6;
      this.camera.position.copy(this.camPos);
      this.camera.lookAt(this.tmpA.set(0, -60, -2640));
      this.world.update(t, dt, this.camPos, this.camDir, 1, false);
      this.applyAtmos(1, dt, true);
    } else {
      // idle void behind the boot screen
      this.camera.position.set(0, 2, 8);
      this.camera.lookAt(0, 2, -120);
      this.world.update(t, dt, this.camera.position, this.tmpB.set(0, 0, -1), 0, false);
      this.applyAtmos(0, dt);
    }

    this.drainCues(t);
    this.glitchBoost = Math.max(0, this.glitchBoost - dt * 1.4);
    this.composer.render();

    // adaptive quality
    this.fpsAccum += dt;
    this.fpsFrames += 1;
    if (this.fpsFrames >= 100) {
      const avg = this.fpsAccum / this.fpsFrames;
      if (avg > 0.036 && !this.degraded) {
        this.degraded = true;
        this.renderer.setPixelRatio(1);
        this.composer.setSize(this.container.clientWidth, Math.max(1, this.container.clientHeight));
      }
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }
  };

  private lastRegionId: RegionId = 'void';

  private updateCamera(dt: number, t: number): void {
    const res = cameraAt(this.p, this.tmpA, this.tmpB);

    // cinematic lateral swing
    const swing = Math.sin(this.p * Math.PI * 5 + 0.6) * res.orbit * 0.4;

    // mouse = human attention, nothing more
    const parTargetX = this.mouseX * 3.2;
    const parTargetY = this.mouseY * 1.8;
    this.parX += (parTargetX - this.parX) * Math.min(1, dt * 3);
    this.parY += (parTargetY - this.parY) * Math.min(1, dt * 3);

    // idle drift — the universe keeps existing around you
    const idle = this.tracker.idleSeconds();
    const idleAmp = this.reducedMotion ? 0 : Math.min(2.2, Math.max(0, idle - 4) * 0.12);

    this.camDir.copy(this.tmpB).sub(this.tmpA).normalize();
    this.right.crossVectors(this.camDir, this.camera.up).normalize();

    this.camPos.copy(this.tmpA);
    this.camPos.addScaledVector(this.right, swing + this.parX + Math.sin(t * 0.23) * idleAmp);
    this.camPos.y += this.parY + Math.cos(t * 0.19) * idleAmp * 0.7 + Math.sin(t * 0.6) * 0.12;

    this.camLook.copy(this.tmpB);
    this.camLook.addScaledVector(this.right, this.parX * 1.8);
    this.camLook.y += this.parY * 1.4;

    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    if (Math.abs(this.camera.fov - res.fov) > 0.05) {
      this.camera.fov += (res.fov - this.camera.fov) * Math.min(1, dt * 4);
      this.camera.updateProjectionMatrix();
    }
  }

  private updateReveal(t: number, dt: number): void {
    const el = t - this.revealStart;
    const DUR = 10.5;
    const u = THREE.MathUtils.clamp(el / DUR, 0, 1);

    const serverPos = this.tmpB.set(0, -65, -2638);
    const endPos = this.tmpA.set(0, 95, -2310);
    const a = smoothstep(THREE.MathUtils.clamp(el / 3.0, 0, 1));
    const b = smoothstep(THREE.MathUtils.clamp((el - 2.6) / (DUR - 2.6), 0, 1));

    // turn to face what stands behind
    const lookServer = new THREE.Vector3(0, -67, -2685);
    const lookSil = new THREE.Vector3(0, -76, -2574);
    const lookEnd = new THREE.Vector3(0, -55, -2660);
    const look = lookServer.clone().lerp(lookSil, a).lerp(lookEnd, b);

    this.camPos.copy(serverPos).lerp(endPos, b);
    this.camPos.y += Math.sin(t * 0.7) * 0.3;
    this.camera.position.copy(this.camPos);
    this.camera.up.set(Math.sin(a * 0.45 - b * 0.45), Math.cos(a * 0.45 - b * 0.45), 0).normalize();
    this.camera.lookAt(look);
    this.camDir.copy(look).sub(this.camPos).normalize();

    this.world.setReveal(u);
    this.world.update(t, dt, this.camPos, this.camDir, 1, false);

    // scripted lines from the previous visitor
    if (el > 2.2 && !this.flags.has('hello')) {
      this.flags.add('hello');
      this.pulseGlitch(this.reducedMotion ? 0.2 : 1.2);
      this.cb.onCue({ id: 'hello', text: 'HELLO.', kind: 'visitor' });
      this.audio.duck(4000);
    }
    if (el > 4.6 && !this.flags.has('waiting')) {
      this.flags.add('waiting');
      this.cb.onCue({ id: 'waiting', text: "I'VE BEEN WAITING FOR YOU.", kind: 'visitor' });
    }
    if (el > 7.2 && !this.flags.has('found')) {
      this.flags.add('found');
      this.cb.onCue({ id: 'found', text: 'YOU FOUND THEM.', kind: 'echo' });
    }

    if (el >= DUR) {
      this.camera.up.set(0, 1, 0);
      this.phase = 'end';
      this.cb.onPhase('end');
    }
  }

  private applyAtmos(p: number, dt: number, revealMode = false): void {
    const at = atmosAt(p);
    const target = this.fogColor.setHex(at.fogColor);
    const fog = this.scene.fog as THREE.FogExp2;
    let density = at.fogDensity;
    let bloom = at.bloom;
    let exposure = at.exposure;
    if (revealMode) {
      target.setHex(0x0b141a);
      density = 0.0024;
      bloom = 0.95;
      exposure = 1.02;
    }
    const k = Math.min(1, dt * 1.8);
    fog.color.lerp(target, k);
    fog.density += (density - fog.density) * k;
    this.renderer.toneMappingExposure += (exposure - this.renderer.toneMappingExposure) * k;
    this.bloomPass.strength += (bloom - this.bloomPass.strength) * Math.min(1, dt * 2.5);

    const u = this.finalPass.uniforms;
    u.uTime.value = this.clock.getElapsedTime();
    const glitch = this.reducedMotion ? 0 : at.glitch * 0.35 + this.glitchBoost * 0.7;
    u.uGlitch.value += (glitch - (u.uGlitch.value as number)) * Math.min(1, dt * 6);
    u.uGrain.value = at.grain;
    u.uScan.value = at.scan;
    u.uChroma.value = at.chroma + this.glitchBoost * 0.8;
  }
}

function smoothstep(u: number): number {
  const x = THREE.MathUtils.clamp(u, 0, 1);
  return x * x * (3 - 2 * x);
}

function gauss(x: number, mu: number, sigma: number): number {
  const d = (x - mu) / sigma;
  return Math.exp(-0.5 * d * d);
}

function regionName(id: RegionId): string {
  switch (id) {
    case 'archive': return 'THE ARCHIVE';
    case 'graveyard': return 'THE GRAVEYARD';
    case 'city': return 'THE SOCIAL CITY';
    case 'ocean': return 'THE MEMORY OCEAN';
    case 'ai': return 'THE AI ZONE';
    case 'descent': return 'THE DESCENT';
    case 'final': return 'THE FINAL SERVER';
    case 'outer': return 'THE OUTER NETWORK';
    default: return 'THE VOID';
  }
}
