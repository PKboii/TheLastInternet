/* THE LAST INTERNET — interface as story.
   Boot ritual, fracture, narrative cues, HUD, the visitor terminal,
   and the final transmission. */

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CueKind } from '../engine/timeline';
import { REGIONS } from '../engine/timeline';
import type { RegionId } from '../engine/audio';
import type { TrackerSnapshot } from '../engine/tracker';

export const REDUCED =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export interface ActiveCue {
  key: number;
  id: string;
  text: string;
  kind: CueKind;
}

/* ---------------- typewriter ---------------- */

export function TypeLine({
  text,
  className,
  speed = 30,
  delay = 0,
  onDone,
  caret = true,
}: {
  text: string;
  className?: string;
  speed?: number;
  delay?: number;
  onDone?: () => void;
  caret?: boolean;
}) {
  const [n, setN] = useState(REDUCED ? text.length : 0);
  const doneRef = useRef(false);
  useEffect(() => {
    if (REDUCED) {
      if (!doneRef.current) {
        doneRef.current = true;
        onDone?.();
      }
      return;
    }
    setN(0);
    doneRef.current = false;
    let i = 0;
    let interval = 0;
    const to = window.setTimeout(() => {
      interval = window.setInterval(() => {
        i += 1;
        setN(i);
        if (i >= text.length) {
          window.clearInterval(interval);
          if (!doneRef.current) {
            doneRef.current = true;
            onDone?.();
          }
        }
      }, speed);
    }, delay);
    return () => {
      window.clearTimeout(to);
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const finished = n >= text.length;
  return (
    <span className={className}>
      {text.slice(0, n)}
      {caret && !finished && <span className="tl-caret text-faintcyan">▌</span>}
    </span>
  );
}

/* ---------------- boot / opening ---------------- */

const BOOT_LINES: Array<{ text: string; cls: string; hold: number }> = [
  { text: 'CONNECTING TO ARCHIVE...', cls: 'text-ash', hold: 850 },
  { text: 'SEARCHING 8,731 YEARS OF DATA...', cls: 'text-ash', hold: 1250 },
  { text: 'RESTORING CORRUPTED MEMORY...', cls: 'text-ash', hold: 1100 },
  { text: 'UNKNOWN PROCESS DETECTED.', cls: 'text-bloodsignal tl-red-shadow', hold: 1200 },
  { text: 'CONNECTION ESTABLISHED.', cls: 'text-faintcyan tl-term-shadow', hold: 700 },
];

const OPENING_LINES: Array<{ text: string; cls: string; speed: number; hold: number }> = [
  { text: 'YEAR 14,092', cls: 'font-display text-coldwhite text-xl md:text-3xl tracking-[0.35em]', speed: 60, hold: 1500 },
  { text: 'HUMANITY HAS BEEN GONE FOR 8,731 YEARS.', cls: 'font-term text-ash text-xs md:text-sm tracking-[0.22em]', speed: 26, hold: 1700 },
  { text: 'THE INTERNET IS STILL ONLINE.', cls: 'font-term text-coldwhite text-xs md:text-sm tracking-[0.22em] tl-term-shadow', speed: 30, hold: 2300 },
  { text: '> CONNECTION ESTABLISHED', cls: 'font-term text-faintcyan text-xs md:text-sm tracking-[0.22em]', speed: 24, hold: 900 },
];

export function BootOverlay({ onEnter }: { onEnter: () => void }) {
  const [bootIdx, setBootIdx] = useState(0);
  const [bootDone, setBootDone] = useState(false);
  const [openIdx, setOpenIdx] = useState(-1);
  const [showEnter, setShowEnter] = useState(false);

  useEffect(() => {
    if (bootIdx >= BOOT_LINES.length) {
      setBootDone(true);
      setOpenIdx(0);
      return;
    }
    const line = BOOT_LINES[bootIdx];
    const t = window.setTimeout(() => setBootIdx(bootIdx + 1), (REDUCED ? 120 : line.hold) + line.text.length * 14);
    return () => window.clearTimeout(t);
  }, [bootIdx]);

  useEffect(() => {
    if (!bootDone || openIdx < 0 || openIdx >= OPENING_LINES.length) return;
    const line = OPENING_LINES[openIdx];
    const t = window.setTimeout(
      () => setOpenIdx(openIdx + 1),
      (REDUCED ? 150 : line.hold) + line.text.length * line.speed
    );
    return () => window.clearTimeout(t);
  }, [bootDone, openIdx]);

  useEffect(() => {
    if (openIdx >= OPENING_LINES.length) {
      const t = window.setTimeout(() => setShowEnter(true), REDUCED ? 100 : 700);
      return () => window.clearTimeout(t);
    }
  }, [openIdx]);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-void">
      <div className="w-[min(88vw,620px)]">
        {/* boot log */}
        <div className="mb-10 space-y-1.5 font-term text-[10px] md:text-[11px] tracking-[0.18em]">
          {BOOT_LINES.slice(0, bootIdx).map((l, i) => (
            <div key={i} className={l.cls}>
              {i === bootIdx - 1 && !bootDone ? <TypeLine text={l.text} speed={12} caret={false} /> : l.text}
            </div>
          ))}
        </div>
        {/* opening */}
        <div className="space-y-6">
          {OPENING_LINES.slice(0, Math.max(0, openIdx + 1)).map((l, i) => (
            <div key={i} className={l.cls}>
              {i === openIdx ? (
                <TypeLine text={l.text} speed={REDUCED ? 1 : l.speed} />
              ) : (
                i < openIdx && l.text
              )}
            </div>
          ))}
        </div>
        {/* enter */}
        <div className="mt-16 flex h-28 items-center">
          {showEnter && (
            <button
              onClick={onEnter}
              className="tl-enter-ring group relative flex h-24 w-24 cursor-pointer items-center justify-center rounded-full border border-faintcyan/40 bg-transparent outline-none"
              aria-label="Enter the last internet"
            >
              <span className="tl-btn font-display text-[11px] tracking-[0.3em] text-coldwhite group-hover:text-faintcyan group-hover:tl-term-shadow">
                ENTER
              </span>
            </button>
          )}
        </div>
        <div className="mt-2 font-term text-[9px] tracking-[0.3em] text-ash/50">
          AN UNKNOWN VISITOR HAS ARRIVED
        </div>
      </div>
    </div>
  );
}

/* ---------------- fracture shards ---------------- */

export function FractureOverlay({ go, onDone }: { go: boolean; onDone: () => void }) {
  const shards = useMemo(() => {
    const cols = 12;
    const rows = 7;
    const arr: Array<{ tx: number; ty: number; rz: number; delay: number }> = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const cx = (x - cols / 2 + 0.5) / cols;
        const cy = (y - rows / 2 + 0.5) / rows;
        const ang = Math.atan2(cy, cx);
        const dist = 60 + Math.hypot(cx, cy) * 130;
        arr.push({
          tx: Math.cos(ang) * dist + (Math.random() - 0.5) * 40,
          ty: Math.sin(ang) * dist + (Math.random() - 0.5) * 40,
          rz: (Math.random() - 0.5) * 90,
          delay: Math.hypot(cx, cy) * 0.25 + Math.random() * 0.08,
        });
      }
    }
    return { arr, cols, rows };
  }, []);

  useEffect(() => {
    if (!go) return;
    const t = window.setTimeout(onDone, REDUCED ? 600 : 2000);
    return () => window.clearTimeout(t);
  }, [go, onDone]);

  if (!go) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden bg-transparent">
      <div
        className="grid h-full w-full"
        style={{ gridTemplateColumns: `repeat(${shards.cols}, 1fr)`, gridTemplateRows: `repeat(${shards.rows}, 1fr)` }}
      >
        {shards.arr.map((s, i) => (
          <div
            key={i}
            className={REDUCED ? 'bg-void transition-opacity duration-500 opacity-0' : 'tl-shard-go bg-void border border-coldwhite/[0.05]'}
            style={{
              ['--tx' as string]: `${s.tx}vw`,
              ['--ty' as string]: `${s.ty}vh`,
              ['--rz' as string]: `${s.rz}deg`,
              ['--delay' as string]: `${s.delay}s`,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/* ---------------- narrative cues ---------------- */

const CUE_DURATION: Record<CueKind, number> = {
  system: 5200,
  visitor: 6800,
  anomaly: 4600,
  echo: 7200,
  guide: 5000,
};

export function CueLayer({ cues }: { cues: ActiveCue[] }) {
  return (
    <>
      {cues.map((c) => {
        if (c.kind === 'visitor') {
          return (
            <div key={c.key} className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center">
              <div className="absolute inset-0 bg-void/35 tl-fade-slow" />
              <div
                className="tl-visitor-in relative px-6 text-center font-term text-sm md:text-lg font-light tracking-[0.18em] text-coldwhite tl-term-shadow"
                style={{ animationDuration: REDUCED ? '0.01s' : '1.1s' }}
              >
                <span className="mr-3 text-faintcyan/70">&gt;</span>
                <TypeLine text={c.text} speed={34} caret={false} />
              </div>
            </div>
          );
        }
        if (c.kind === 'anomaly') {
          return (
            <div key={c.key} className="pointer-events-none absolute right-5 top-20 z-40 max-w-[280px] border-l border-bloodsignal/70 pl-3">
              <div className="tl-cue-in font-term text-[10px] tracking-[0.2em] text-oldamber tl-amber-shadow">
                <TypeLine text={c.text} speed={20} caret={false} />
              </div>
            </div>
          );
        }
        if (c.kind === 'echo') {
          return (
            <div key={c.key} className="pointer-events-none absolute bottom-24 left-6 z-40 max-w-[320px]">
              <div className="tl-cue-in font-term text-[11px] font-light italic tracking-[0.14em] text-ghostgreen/70">
                <TypeLine text={c.text} speed={26} caret={false} />
              </div>
            </div>
          );
        }
        return (
          <div key={c.key} className="pointer-events-none absolute inset-x-0 bottom-[13vh] z-40 flex justify-center px-6">
            <div className="tl-cue-in max-w-[760px] text-center font-term text-[11px] md:text-xs tracking-[0.24em] text-coldwhite/90">
              <span className="mr-2 text-faintcyan/80">&gt;</span>
              <TypeLine text={c.text} speed={22} caret={false} />
            </div>
          </div>
        );
      })}
    </>
  );
}

/* ---------------- HUD ---------------- */

export function Hud({
  region,
  stats,
  showHint,
  hover,
}: {
  region: { name: string; id: RegionId };
  stats: (TrackerSnapshot & { p: number }) | null;
  showHint: boolean;
  hover: boolean;
}) {
  const p = stats?.p ?? 0;
  return (
    <div className="pointer-events-none absolute inset-0 z-30 font-term">
      {/* top left — identity */}
      <div className="absolute left-5 top-5 md:left-7 md:top-6">
        <div className="tl-glitch-hover font-display text-[10px] md:text-[11px] tracking-[0.4em] text-coldwhite/85" data-text="THE LAST INTERNET">
          THE LAST INTERNET
        </div>
        <div className="mt-1.5 text-[8px] md:text-[9px] tracking-[0.3em] text-ash/70">
          YEAR 14,092 · SIGNAL 8,731 YEARS DEEP
        </div>
      </div>

      {/* top right — session record */}
      <div className="absolute right-5 top-5 text-right md:right-7 md:top-6">
        <div className="flex items-center justify-end gap-2 text-[9px] tracking-[0.28em] text-ash/80">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-bloodsignal tl-flicker" />
          REC {stats?.sessionClock ?? '00:00'}
        </div>
        <div className="mt-1.5 text-[8px] tracking-[0.26em] text-ash/50">
          VISITOR #28491 · SESSION LOCAL
        </div>
      </div>

      {/* bottom left — region + dwell */}
      <div className="absolute bottom-5 left-5 md:bottom-7 md:left-7">
        <div className="text-[10px] md:text-[11px] tracking-[0.34em] text-coldwhite/80 tl-flicker">
          {region.name}
        </div>
        <div className="mt-1.5 flex gap-4 text-[8px] md:text-[9px] tracking-[0.24em] text-ash/60">
          <span>DWELL {stats?.regionClock ?? '00:00'}</span>
          <span>BACK ×{stats?.backwardCount ?? 0}</span>
          <span>ANOMALIES {String(stats?.anomalies ?? 0).padStart(2, '0')}</span>
        </div>
      </div>

      {/* right edge — descent timeline */}
      <div className="absolute right-5 top-1/2 hidden -translate-y-1/2 md:block md:right-7">
        <div className="relative h-[46vh] w-px bg-coldwhite/10">
          {REGIONS.filter((r) => r.from >= 0 && r.to <= 1.5).map((r) => (
            <div
              key={r.id}
              className="absolute -left-[3px] h-[7px] w-[7px] rounded-full border"
              style={{
                top: `${Math.min(r.from, 1) * 100}%`,
                borderColor: p >= r.from ? 'rgba(95,201,212,0.8)' : 'rgba(107,125,128,0.35)',
                background: p >= r.from && p < r.to ? 'rgba(95,201,212,0.55)' : 'transparent',
              }}
            />
          ))}
          <div
            className="absolute -left-[2.5px] h-[6px] w-[6px] rounded-full bg-coldwhite shadow-[0_0_10px_rgba(95,201,212,0.9)] transition-[top] duration-300 ease-out"
            style={{ top: `calc(${Math.min(p, 1) * 100}% - 3px)` }}
          />
        </div>
      </div>

      {/* bottom center — scroll hint */}
      {showHint && (
        <div className="absolute inset-x-0 bottom-7 flex flex-col items-center gap-3">
          <div className="text-[9px] tracking-[0.5em] text-coldwhite/70">SCROLL TO DESCEND</div>
          <div className="h-10 w-px overflow-hidden bg-coldwhite/10">
            <div className="tl-hint-line h-full w-full bg-faintcyan/80" style={{ animationDuration: '2.2s', animationIterationCount: 'infinite' }} />
          </div>
        </div>
      )}

      {/* cursor */}
      <CursorDot hover={hover} />
    </div>
  );
}

function CursorDot({ hover }: { hover: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const pos = useRef({ x: -100, y: -100 });
  const target = useRef({ x: -100, y: -100 });

  useEffect(() => {
    if (window.matchMedia('(pointer: coarse)').matches) return;
    const onMove = (e: PointerEvent) => {
      target.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    let raf = 0;
    const tick = () => {
      pos.current.x += (target.current.x - pos.current.x) * 0.22;
      pos.current.y += (target.current.y - pos.current.y) * 0.22;
      if (ref.current) {
        ref.current.style.transform = `translate(${pos.current.x}px, ${pos.current.y}px) translate(-50%,-50%)`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  if (typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches) return null;
  return (
    <div
      ref={ref}
      className={`tl-cursor-dot pointer-events-none fixed left-0 top-0 z-50 rounded-full border ${
        hover
          ? 'h-8 w-8 border-oldamber bg-oldamber/10'
          : 'h-3 w-3 border-coldwhite/70 bg-coldwhite/10'
      }`}
    />
  );
}

/* ---------------- visitor terminal ---------------- */

const LOST_RUN = Array.from({ length: 14 }, (_, i) => i + 1);

export function TerminalOverlay({ onDone }: { onDone: () => void }) {
  const [stage, setStage] = useState(0);
  const [lostIdx, setLostIdx] = useState(0);
  const doneRef = useRef(false);

  useEffect(() => {
    if (doneRef.current) return;
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, REDUCED ? ms / 6 : ms));

    later(() => setStage(1), 900);                                   // VISITOR ARCHIVE
    later(() => setStage(2), 2200);                                  // lost entries begin
    later(() => setStage(3), 2200 + 14 * 260 + 700);                 // #28491 ACTIVE
    later(() => setStage(4), 2200 + 14 * 260 + 700 + 2600);          // YOU ARE NOT THE USER
    later(() => setStage(5), 2200 + 14 * 260 + 700 + 4400);          // YOU ARE THE DATA
    later(() => setStage(6), 2200 + 14 * 260 + 700 + 6800);          // the file
    later(() => setStage(7), 2200 + 14 * 260 + 700 + 12800);         // complete
    later(() => {
      if (!doneRef.current) {
        doneRef.current = true;
        onDone();
      }
    }, 2200 + 14 * 260 + 700 + 14600);
    return () => timers.forEach((t) => window.clearTimeout(t));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (stage !== 2) return;
    const iv = window.setInterval(() => {
      setLostIdx((i) => {
        if (i >= LOST_RUN.length) {
          window.clearInterval(iv);
          return i;
        }
        return i + 1;
      });
    }, REDUCED ? 40 : 260);
    return () => window.clearInterval(iv);
  }, [stage]);

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center">
      <div className="w-[min(92vw,640px)] border border-coldwhite/15 bg-void/70 px-6 py-7 md:px-10 md:py-9 font-term backdrop-blur-[2px]">
        <div className="mb-5 flex items-center justify-between text-[9px] tracking-[0.3em] text-ash/70">
          <span>NODE 000 · ORIGIN</span>
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-ghostgreen tl-flicker" />
            LIVE FEED
          </span>
        </div>

        {stage >= 1 && (
          <div className="font-display text-sm md:text-lg tracking-[0.4em] text-coldwhite tl-term-shadow">
            {stage === 1 ? <TypeLine text="VISITOR ARCHIVE" speed={55} /> : 'VISITOR ARCHIVE'}
          </div>
        )}

        {stage >= 2 && (
          <div className="mt-6 max-h-[26vh] space-y-1.5 overflow-hidden text-[10px] md:text-[11px] tracking-[0.18em]">
            {LOST_RUN.slice(0, lostIdx).map((n) => (
              <div key={n} className="flex justify-between text-ash/85">
                <span>VISITOR #{String(n).padStart(3, '0')}</span>
                <span className="text-ash/50">STATUS: LOST</span>
              </div>
            ))}
            {lostIdx >= LOST_RUN.length && (
              <div className="pt-1 text-ash/45">
                ··· 28,488 MORE ENTRIES ··· ALL STATUS: LOST ···
              </div>
            )}
          </div>
        )}

        {stage >= 3 && (
          <div className="mt-5 flex justify-between border-t border-coldwhite/10 pt-4 text-[11px] md:text-xs tracking-[0.18em]">
            <span className="text-coldwhite">
              {stage === 3 ? <TypeLine text="VISITOR #28491" speed={45} /> : 'VISITOR #28491'}
            </span>
            <span className="text-ghostgreen tl-term-shadow tl-flicker">STATUS: ACTIVE</span>
          </div>
        )}

        {stage >= 4 && (
          <div className="mt-7 space-y-4 text-[11px] md:text-[13px] tracking-[0.2em] text-coldwhite">
            <div>
              <span className="text-faintcyan/80">&gt; </span>
              {stage === 4 ? <TypeLine text="YOU ARE NOT THE USER." speed={42} /> : 'YOU ARE NOT THE USER.'}
            </div>
            {stage >= 5 && (
              <div className="text-bloodsignal tl-red-shadow">
                <span className="text-faintcyan/80">&gt; </span>
                {stage === 5 ? <TypeLine text="YOU ARE THE DATA." speed={42} /> : 'YOU ARE THE DATA.'}
              </div>
            )}
          </div>
        )}

        {stage >= 6 && (
          <div className="mt-7 border-l border-oldamber/50 pl-4 text-[10px] md:text-[11px] font-light italic leading-relaxed tracking-[0.14em] text-oldamber/90 tl-amber-shadow">
            {stage === 6 ? (
              <TypeLine text={'"If you\'re reading this, someone survived."'} speed={30} caret={false} />
            ) : (
              <>
                <div>"If you're reading this, someone survived."</div>
                <div className="mt-2">"I thought I was the last one."</div>
                {stage >= 7 && <div className="mt-2 text-coldwhite/90">"I was wrong."</div>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- final transmission ---------------- */

export function EndOverlay({ onReenter }: { onReenter: () => void }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers: number[] = [];
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, REDUCED ? ms / 5 : ms));
    later(() => setStage(1), 800);
    later(() => setStage(2), 2900);
    later(() => setStage(3), 5100);
    later(() => setStage(4), 8300);
    later(() => setStage(5), 11200);
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  const lines = ['CONNECTION STILL ACTIVE.', 'SESSION SAVED.', 'NEW VISITOR DETECTED.'];

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-void">
      <div className="space-y-5 text-center font-term">
        {stage >= 1 && stage < 4 &&
          lines.slice(0, stage).map((l, i) => (
            <div
              key={l}
              className="text-[11px] md:text-xs tracking-[0.3em] text-coldwhite/85"
              style={{ animation: REDUCED ? undefined : 'tl-endline 2.4s ease forwards' }}
            >
              <span className="mr-2 text-faintcyan/70">&gt;</span>
              {l}
              {i === stage - 1 && stage < 3 && <span className="tl-caret ml-1 text-faintcyan">▌</span>}
            </div>
          ))}
        {stage >= 4 && (
          <div
            className="font-display text-2xl md:text-5xl text-coldwhite tl-term-shadow"
            style={{ animation: REDUCED ? undefined : 'tl-welcome 2.6s cubic-bezier(0.2,0.7,0.2,1) forwards' }}
          >
            WELCOME.
          </div>
        )}
        {stage >= 5 && (
          <button
            onClick={onReenter}
            className="tl-btn mt-10 cursor-pointer border border-faintcyan/30 px-8 py-3 font-term text-[10px] tracking-[0.35em] text-faintcyan/90 outline-none hover:border-faintcyan/70 hover:text-coldwhite"
          >
            RE-ENTER THE ARCHIVE
          </button>
        )}
      </div>
      <div className="absolute bottom-8 text-[8px] tracking-[0.4em] text-ash/40">
        THE INTERNET REMEMBERS EVERYONE WHO STAYS
      </div>
    </div>
  );
}

/* ---------------- ambient screen dressing ---------------- */

export function ScreenDressing({ letterbox }: { letterbox: boolean }) {
  return (
    <>
      <div className="pointer-events-none absolute inset-0 z-20 tl-scanlines opacity-60" />
      <div className="pointer-events-none absolute inset-0 z-20 tl-grain opacity-[0.05] mix-blend-overlay" />
      <div className="pointer-events-none absolute inset-0 z-20 tl-vignette" />
      {/* letterbox */}
      <div className={`tl-letterbox pointer-events-none absolute inset-x-0 top-0 z-30 bg-void ${letterbox ? 'h-[6vh]' : 'h-0'}`} />
      <div className={`tl-letterbox pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-void ${letterbox ? 'h-[6vh]' : 'h-0'}`} />
    </>
  );
}
