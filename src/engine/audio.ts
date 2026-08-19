/* THE LAST INTERNET — synthesized spatial audio.
   No assets. Everything is generated: drones, server hum, hiss, sub-bass,
   data clicks, radio blips. Silence is used as a weapon. */

export type RegionId =
  | 'void'
  | 'outer'
  | 'archive'
  | 'graveyard'
  | 'city'
  | 'ocean'
  | 'ai'
  | 'descent'
  | 'final';

interface RegionProfile {
  drone: number;
  hum: number;
  hiss: number;
  sub: number;
  tickRate: number; // probability per second
  tickGain: number;
}

const PROFILES: Record<RegionId, RegionProfile> = {
  void:      { drone: 0.0,  hum: 0.0,  hiss: 0.0,  sub: 0.0,  tickRate: 0.0,  tickGain: 0.0 },
  outer:     { drone: 0.05, hum: 0.0,  hiss: 0.01, sub: 0.0,  tickRate: 0.25, tickGain: 0.02 },
  archive:   { drone: 0.08, hum: 0.02, hiss: 0.02, sub: 0.0,  tickRate: 0.8,  tickGain: 0.03 },
  graveyard: { drone: 0.1,  hum: 0.12, hiss: 0.03, sub: 0.04, tickRate: 0.4,  tickGain: 0.03 },
  city:      { drone: 0.09, hum: 0.05, hiss: 0.05, sub: 0.03, tickRate: 1.4,  tickGain: 0.025 },
  ocean:     { drone: 0.06, hum: 0.0,  hiss: 0.09, sub: 0.06, tickRate: 0.15, tickGain: 0.02 },
  ai:        { drone: 0.05, hum: 0.0,  hiss: 0.02, sub: 0.16, tickRate: 0.05, tickGain: 0.015 },
  descent:   { drone: 0.04, hum: 0.06, hiss: 0.01, sub: 0.05, tickRate: 0.1,  tickGain: 0.02 },
  final:     { drone: 0.02, hum: 0.09, hiss: 0.0,  sub: 0.02, tickRate: 0.02, tickGain: 0.01 },
};

export class AudioSystem {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private humGain: GainNode | null = null;
  private hissGain: GainNode | null = null;
  private subGain: GainNode | null = null;
  private humProximity: GainNode | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private tickTimer: number | null = null;
  private started = false;
  private muted = false;
  private current: RegionId = 'void';
  private duckTimeout: number | null = null;

  /** Must be called from a user gesture. */
  start(): void {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      this.ctx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.0;
      this.master.connect(ctx.destination);

      // ---- deep drone: two detuned lows + a faint fifth
      this.droneGain = ctx.createGain();
      this.droneGain.gain.value = 0;
      const droneFilter = ctx.createBiquadFilter();
      droneFilter.type = 'lowpass';
      droneFilter.frequency.value = 140;
      droneFilter.connect(this.droneGain);
      this.droneGain.connect(this.master);
      const mkOsc = (type: OscillatorType, freq: number, g: number) => {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        const og = ctx.createGain();
        og.gain.value = g;
        o.connect(og);
        og.connect(droneFilter);
        o.start();
      };
      mkOsc('sine', 41, 0.6);
      mkOsc('sine', 41.7, 0.5);
      mkOsc('triangle', 82.4, 0.12);

      // ---- electrical hum (50Hz saw through lowpass), proximity-driven
      this.humGain = ctx.createGain();
      this.humGain.gain.value = 0;
      this.humProximity = ctx.createGain();
      this.humProximity.gain.value = 0;
      const humFilter = ctx.createBiquadFilter();
      humFilter.type = 'lowpass';
      humFilter.frequency.value = 320;
      humFilter.Q.value = 2;
      const humOsc = ctx.createOscillator();
      humOsc.type = 'sawtooth';
      humOsc.frequency.value = 50;
      const humOsc2 = ctx.createOscillator();
      humOsc2.type = 'sine';
      humOsc2.frequency.value = 100;
      const h2g = ctx.createGain();
      h2g.gain.value = 0.4;
      humOsc.connect(humFilter);
      humOsc2.connect(h2g);
      h2g.connect(humFilter);
      humFilter.connect(this.humProximity);
      this.humProximity.connect(this.humGain);
      this.humGain.connect(this.master);
      humOsc.start();
      humOsc2.start();

      // ---- noise bed (hiss / data transmission)
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noiseBuf = buf;
      this.hissGain = ctx.createGain();
      this.hissGain.gain.value = 0;
      const hissFilter = ctx.createBiquadFilter();
      hissFilter.type = 'bandpass';
      hissFilter.frequency.value = 900;
      hissFilter.Q.value = 0.6;
      const hissSrc = ctx.createBufferSource();
      hissSrc.buffer = buf;
      hissSrc.loop = true;
      hissSrc.connect(hissFilter);
      hissFilter.connect(this.hissGain);
      this.hissGain.connect(this.master);
      hissSrc.start();

      // ---- sub-bass presence for the AI zone
      this.subGain = ctx.createGain();
      this.subGain.gain.value = 0;
      const subOsc = ctx.createOscillator();
      subOsc.type = 'sine';
      subOsc.frequency.value = 27.5;
      const subLfo = ctx.createOscillator();
      subLfo.frequency.value = 0.07;
      const subLfoGain = ctx.createGain();
      subLfoGain.gain.value = 0.35;
      const subBase = ctx.createGain();
      subBase.gain.value = 0.65;
      subLfo.connect(subLfoGain);
      subLfoGain.connect(subBase.gain);
      subOsc.connect(subBase);
      subBase.connect(this.subGain);
      this.subGain.connect(this.master);
      subOsc.start();
      subLfo.start();

      // fade master in
      this.master.gain.setTargetAtTime(0.85, ctx.currentTime, 2.5);
      this.started = true;
      this.applyRegion(this.current);
      this.scheduleTicks();
    } catch {
      /* audio unavailable — the experience continues in silence */
    }
  }

  private scheduleTicks(): void {
    const loop = () => {
      if (!this.ctx || !this.started) return;
      const prof = PROFILES[this.current];
      const delay = 200 + Math.random() * 1400;
      this.tickTimer = window.setTimeout(() => {
        if (Math.random() < prof.tickRate) this.click(prof.tickGain);
        loop();
      }, delay);
    };
    loop();
  }

  /** Short filtered-noise data click or radio blip. */
  private click(gain: number): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf || this.muted) return;
    const t = ctx.currentTime;
    if (Math.random() < 0.7) {
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const f = ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 1800 + Math.random() * 3000;
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain * (0.4 + Math.random() * 0.8), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.06);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t, Math.random() * 1.5, 0.12);
    } else {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(900 + Math.random() * 700, t);
      o.frequency.exponentialRampToValueAtTime(300, t + 0.08);
      const g = ctx.createGain();
      g.gain.setValueAtTime(gain * 0.5, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g); g.connect(this.master);
      o.start(t); o.stop(t + 0.1);
    }
  }

  /** Riser + impact for the ENTER fracture. */
  burst(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.noiseBuf) return;
    const t = ctx.currentTime;
    // riser
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.4;
    f.frequency.setValueAtTime(120, t);
    f.frequency.exponentialRampToValueAtTime(2600, t + 2.1);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 2.0);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + 2.7);
    // impact thump
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t + 2.05);
    o.frequency.exponentialRampToValueAtTime(28, t + 3.4);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.0001, t + 2.05);
    og.gain.exponentialRampToValueAtTime(0.5, t + 2.12);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 3.6);
    o.connect(og); og.connect(this.master);
    o.start(t + 2.05); o.stop(t + 3.7);
  }

  private ramp(param: AudioParam, value: number, time: number): void {
    if (!this.ctx) return;
    param.setTargetAtTime(value, this.ctx.currentTime, time);
  }

  private applyRegion(r: RegionId): void {
    const p = PROFILES[r];
    if (this.droneGain) this.ramp(this.droneGain.gain, p.drone, 2.2);
    if (this.humGain) this.ramp(this.humGain.gain, p.hum, 2.2);
    if (this.hissGain) this.ramp(this.hissGain.gain, p.hiss, 2.2);
    if (this.subGain) this.ramp(this.subGain.gain, p.sub, 2.6);
  }

  setRegion(r: RegionId): void {
    if (r === this.current) return;
    this.current = r;
    if (this.started) this.applyRegion(r);
  }

  /** Extra hum when the camera is close to something alive. 0..1 */
  setProximity(v: number): void {
    if (this.humProximity) this.ramp(this.humProximity.gain, Math.min(1, Math.max(0, v)), 0.4);
  }

  /** Strip the room away. Used when the previous visitor speaks. */
  duck(ms = 3200): void {
    if (!this.ctx || !this.master) return;
    this.muted = true;
    this.ramp(this.master.gain, 0.06, 0.5);
    if (this.duckTimeout) window.clearTimeout(this.duckTimeout);
    this.duckTimeout = window.setTimeout(() => {
      this.muted = false;
      if (this.master && this.ctx) {
        this.master.gain.setTargetAtTime(0.85, this.ctx.currentTime, 2.0);
      }
    }, ms);
  }

  /** Soft chime when a guided path lights up. */
  guide(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master || this.muted) return;
    const t = ctx.currentTime;
    [523.25, 784].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.14);
      g.gain.exponentialRampToValueAtTime(0.03, t + i * 0.14 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.14 + 1.4);
      o.connect(g); g.connect(this.master!);
      o.start(t + i * 0.14); o.stop(t + i * 0.14 + 1.5);
    });
  }

  dispose(): void {
    if (this.tickTimer) window.clearTimeout(this.tickTimer);
    if (this.duckTimeout) window.clearTimeout(this.duckTimeout);
    if (this.ctx) void this.ctx.close().catch(() => undefined);
    this.ctx = null;
    this.started = false;
  }
}
