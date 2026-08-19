/* THE LAST INTERNET — the website is the experience.
   React hosts the engine and speaks its language: cues, phases, memory. */

import { useCallback, useEffect, useRef, useState } from 'react';
import { LastInternetEngine, type CueEvent, type EnginePhase } from './engine/core';
import type { RegionId } from './engine/audio';
import type { TrackerSnapshot } from './engine/tracker';
import {
  BootOverlay,
  CueLayer,
  EndOverlay,
  FractureOverlay,
  Hud,
  ScreenDressing,
  TerminalOverlay,
  type ActiveCue,
} from './ui/Overlays';

type UiPhase = 'boot' | 'fracture' | 'experience' | 'terminal' | 'reveal' | 'end';

const CUE_LIFE: Record<string, number> = {
  system: 5200,
  visitor: 6800,
  anomaly: 4600,
  echo: 7200,
  guide: 5000,
};

export default function App() {
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<LastInternetEngine | null>(null);
  const [phase, setPhase] = useState<UiPhase>('boot');
  const phaseRef = useRef<UiPhase>('boot');
  const [cues, setCues] = useState<ActiveCue[]>([]);
  const [region, setRegion] = useState<{ name: string; id: RegionId }>({
    name: 'SIGNAL VOID',
    id: 'void',
  });
  const [stats, setStats] = useState<(TrackerSnapshot & { p: number }) | null>(null);
  const [hover, setHover] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const cueKey = useRef(0);
  const timers = useRef<number[]>([]);

  const setUiPhase = useCallback((p: UiPhase) => {
    phaseRef.current = p;
    setPhase(p);
  }, []);

  const addCue = useCallback((cue: CueEvent) => {
    cueKey.current += 1;
    const key = cueKey.current;
    setCues((prev) => [...prev.slice(-2), { key, id: cue.id, text: cue.text, kind: cue.kind }]);
    const life = CUE_LIFE[cue.kind] ?? 5000;
    timers.current.push(
      window.setTimeout(() => {
        setCues((prev) => prev.filter((c) => c.key !== key));
      }, life)
    );
  }, []);

  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const engine = new LastInternetEngine(el, {
      onCue: addCue,
      onPhase: (p: EnginePhase) => {
        if (p === 'terminal') setUiPhase('terminal');
        else if (p === 'reveal') setUiPhase('reveal');
        else if (p === 'end') setUiPhase('end');
        // 'experience' from reset() — App drives that transition itself
        if (p === 'experience') {
          setCues([]);
          setScrolled(false);
        }
      },
      onRegion: (name, id) => setRegion({ name, id }),
      onStats: (s) => {
        setStats(s);
        if (s.p > 0.115) setScrolled(true);
      },
      onHover: (h) => setHover(h),
    });
    engineRef.current = engine;
    return () => {
      engine.dispose();
      engineRef.current = null;
      timers.current.forEach((t) => window.clearTimeout(t));
    };
  }, [addCue, setUiPhase]);

  const handleEnter = useCallback(() => {
    setUiPhase('fracture');
    engineRef.current?.enter();
    timers.current.push(window.setTimeout(() => setUiPhase('experience'), 1900));
  }, [setUiPhase]);

  const handleFractureDone = useCallback(() => {
    if (phaseRef.current === 'fracture') setUiPhase('experience');
  }, [setUiPhase]);

  const handleTerminalDone = useCallback(() => {
    engineRef.current?.beginReveal();
  }, []);

  const handleReenter = useCallback(() => {
    setCues([]);
    setScrolled(false);
    engineRef.current?.reset();
    setUiPhase('experience');
  }, [setUiPhase]);

  const inWorld = phase === 'experience' || phase === 'terminal' || phase === 'reveal';
  const letterbox = phase === 'terminal' || phase === 'reveal' || phase === 'end';
  const showHint = phase === 'experience' && !scrolled && (stats?.p ?? 0) < 0.12;

  return (
    <div className="fixed inset-0 select-none overflow-hidden bg-void text-coldwhite">
      {/* the universe */}
      <div ref={mountRef} className="absolute inset-0 z-0" />

      {/* ambient screen layers */}
      <ScreenDressing letterbox={letterbox} />

      {/* narrative cues */}
      {inWorld && <CueLayer cues={cues} />}

      {/* HUD */}
      {inWorld && <Hud region={region} stats={stats} showHint={showHint} hover={hover} />}

      {/* boot ritual */}
      {phase === 'boot' && <BootOverlay onEnter={handleEnter} />}

      {/* the fracture */}
      <FractureOverlay go={phase === 'fracture'} onDone={handleFractureDone} />

      {/* the visitor archive terminal */}
      {phase === 'terminal' && <TerminalOverlay onDone={handleTerminalDone} />}

      {/* final transmission */}
      {phase === 'end' && <EndOverlay onReenter={handleReenter} />}
    </div>
  );
}
