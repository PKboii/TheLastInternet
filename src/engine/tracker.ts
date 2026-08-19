/* THE LAST INTERNET — visitor memory.
   The world watches the visitor watching it. Nothing leaves the browser;
   every "it knows me" line is generated from this session alone. */

import type { RegionId } from './audio';

export interface TrackerSnapshot {
  sessionSeconds: number;
  region: RegionId;
  regionClock: string;      // MM:SS inside current region
  sessionClock: string;
  backwardCount: number;
  anomalies: number;
  hovers: number;
}

export class BehaviorTracker {
  private start = 0;
  private lastT = 0;
  private regionEntered = 0;
  private dwell: Partial<Record<RegionId, number>> = {};
  private hoverTime: Record<string, number> = {};
  private backAccum = 0;
  private idle = 0;
  private lastInputAt = 0;
  private anomalySet = new Set<string>();

  backwardCount = 0;
  hovers = 0;
  currentRegion: RegionId = 'void';
  stoppedAt: number[] = [];
  private stillTime = 0;

  begin(): void {
    this.start = performance.now();
    this.lastT = this.start;
    this.lastInputAt = this.start;
    this.regionEntered = this.start;
  }

  sessionSeconds(): number {
    return this.start ? (performance.now() - this.start) / 1000 : 0;
  }

  sessionMinutes(): number {
    return this.sessionSeconds() / 60;
  }

  idleSeconds(): number {
    return this.lastInputAt ? (performance.now() - this.lastInputAt) / 1000 : 0;
  }

  dwellSeconds(r: RegionId): number {
    return this.dwell[r] ?? 0;
  }

  markInput(): void {
    this.lastInputAt = performance.now();
    this.idle = 0;
  }

  markBackward(): void {
    this.backwardCount += 1;
  }

  markHover(id: string, dt: number): void {
    this.hoverTime[id] = (this.hoverTime[id] ?? 0) + dt;
  }

  hoverSeconds(id: string): number {
    return this.hoverTime[id] ?? 0;
  }

  firstHover(id: string): boolean {
    if (this.hoverTime[id]) return false;
    this.hoverTime[id] = 0.0001;
    this.hovers += 1;
    return true;
  }

  markAnomaly(id: string): boolean {
    if (this.anomalySet.has(id)) return false;
    this.anomalySet.add(id);
    return true;
  }

  anomalies(): number {
    return this.anomalySet.size;
  }

  tick(dt: number, p: number, region: RegionId, velocity: number): void {
    if (!this.start) return;
    if (region !== this.currentRegion) {
      this.currentRegion = region;
      this.regionEntered = performance.now();
    }
    this.dwell[region] = (this.dwell[region] ?? 0) + dt;
    this.idle = this.idleSeconds();

    // remember where the visitor stops scrolling
    if (Math.abs(velocity) < 0.0004) {
      this.stillTime += dt;
      if (this.stillTime > 2.2) {
        const last = this.stoppedAt[this.stoppedAt.length - 1];
        if (last === undefined || Math.abs(last - p) > 0.03) {
          this.stoppedAt.push(p);
          if (this.stoppedAt.length > 64) this.stoppedAt.shift();
        }
        this.stillTime = 0;
      }
    } else {
      this.stillTime = 0;
    }
  }

  regionClock(): string {
    const s = Math.floor((performance.now() - this.regionEntered) / 1000);
    return fmt(s);
  }

  regionClockSeconds(): number {
    return (performance.now() - this.regionEntered) / 1000;
  }

  snapshot(): TrackerSnapshot {
    return {
      sessionSeconds: this.sessionSeconds(),
      region: this.currentRegion,
      regionClock: this.regionClock(),
      sessionClock: fmt(Math.floor(this.sessionSeconds())),
      backwardCount: this.backwardCount,
      anomalies: this.anomalies(),
      hovers: this.hovers,
    };
  }

  reset(): void {
    this.start = performance.now();
    this.lastT = this.start;
    this.regionEntered = this.start;
    this.dwell = {};
    this.hoverTime = {};
    this.backAccum = 0;
    this.idle = 0;
    this.anomalySet.clear();
    this.backwardCount = 0;
    this.hovers = 0;
    this.stoppedAt = [];
    this.currentRegion = 'void';
  }

  /** Feed raw scroll delta; returns true when a deliberate backward gesture lands. */
  onScrollDelta(delta: number): boolean {
    this.markInput();
    if (delta < 0) {
      this.backAccum += delta;
      if (this.backAccum < -0.045) {
        this.backAccum = 0;
        this.markBackward();
        return true;
      }
    } else {
      this.backAccum = Math.max(0, this.backAccum + delta);
    }
    return false;
  }
}

function fmt(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}
