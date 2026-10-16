import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { ClientView } from '../../shared/view-types';
import { useFx, usePrefs } from '../lib/prefs';

type Scene = 'dawn' | 'night' | 'day' | 'runoff' | 'tie' | 'over' | 'reveal';

const EMBLEM: Record<Scene, ReactElement> = {
  dawn: (
    <>
      <path d="M8 44h48" />
      <path d="M18 44a14 14 0 0 1 28 0" className="curtain-rise" />
      {[-60, -30, 0, 30, 60].map((a) => (
        <path key={a} d="M32 22v-8" transform={`rotate(${a} 32 44)`} className="curtain-ray" />
      ))}
    </>
  ),
  night: (
    <>
      <path d="M40 14a18 18 0 1 0 10 30 15 15 0 1 1-10-30z" />
      <circle cx="16" cy="18" r="1.4" className="curtain-twinkle" />
      <circle cx="52" cy="12" r="1.1" className="curtain-twinkle" style={{ animationDelay: '0.4s' }} />
      <circle cx="12" cy="40" r="1" className="curtain-twinkle" style={{ animationDelay: '0.8s' }} />
    </>
  ),
  day: (
    <>
      <circle cx="32" cy="32" r="10" />
      {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
        <path key={a} d="M32 14v-6" transform={`rotate(${a} 32 32)`} className="curtain-ray" />
      ))}
    </>
  ),
  runoff: (
    <>
      <path d="M32 12v40M20 52h24M14 22h36" />
      <path d="M14 22l-6 14a6 6 0 0 0 12 0zM50 22l-6 14a6 6 0 0 0 12 0z" />
    </>
  ),
  tie: (
    <>
      <path d="M32 12v40M20 52h24M14 22h36" />
      <path d="M14 22l-6 14a6 6 0 0 0 12 0zM50 22l-6 14a6 6 0 0 0 12 0z" />
    </>
  ),
  over: (
    <>
      <path d="M20 50c-10-8-12-22-4-32M44 50c10-8 12-22 4-32" />
      <path d="M17 30c3 0 5 2 5 5M15 40c3-1 6 0 7 3M47 30c-3 0-5 2-5 5M49 40c-3-1-6 0-7 3" />
      <path d="M26 20l6-8 6 8-6 4z" />
    </>
  ),
  reveal: (
    <>
      <rect x="18" y="10" width="28" height="44" rx="4" />
      <path d="M26 26l12 12M38 26L26 38" opacity="0.6" />
    </>
  ),
};

const TITLE: Record<Scene, string> = {
  dawn: 'Dawn',
  night: 'Night Falls',
  day: 'Day Breaks',
  runoff: 'Runoff Vote',
  tie: 'A Tie',
  over: 'The End',
  reveal: 'Your Role Awaits',
};

/**
 * Plays the public phase transition: a short full-screen moment, a sound cue and
 * a buzz — identical on every phone (and the TV), so nothing about roles leaks.
 * Also sets a phase class on <body> that drives the ambient background.
 */
export function usePhaseFx(view: ClientView | null) {
  const { play, buzz } = useFx();
  const [scene, setScene] = useState<{ scene: Scene; sub: string; key: number } | null>(null);
  const last = useRef<number | null>(null);
  const g = view?.game ?? null;
  const key = g ? g.phaseSeq : -1;

  useEffect(() => {
    const body = document.body;
    const phase = g?.phase ?? 'lobby';
    const cls = phase === 'prenight' ? 'phase-dawn' : phase === 'night' ? 'phase-night' : phase === 'voting' || phase === 'verdict' ? 'phase-day' : phase === 'game_over' ? 'phase-over' : 'phase-lobby';
    body.classList.remove('phase-dawn', 'phase-night', 'phase-day', 'phase-over', 'phase-lobby', 'night-mode');
    body.classList.add(cls);
    if (phase === 'night' || phase === 'prenight') body.classList.add('night-mode');
  }, [g?.phase]);
  useEffect(() => () => document.body.classList.remove('phase-dawn', 'phase-night', 'phase-day', 'phase-over', 'phase-lobby', 'night-mode'), []);

  useEffect(() => {
    if (!g) return;
    const first = last.current === null;
    if (last.current === key) return;
    last.current = key;
    if (first) return; // don't replay when (re)joining mid-phase
    let s: Scene | null = null;
    if (g.phase === 'prenight') s = 'dawn';
    else if (g.phase === 'night') s = 'night';
    else if (g.phase === 'voting') s = g.runoff ? 'runoff' : 'day';
    else if (g.phase === 'verdict') s = 'tie';
    else if (g.phase === 'game_over') s = 'over';
    else if (g.phase === 'reveal') s = 'reveal';
    if (!s) return;
    if (s === 'dawn') play('dawn');
    if (s === 'night') play('night');
    if (s === 'day') play('day');
    if (s === 'runoff' || s === 'tie') play('verdict');
    if (s === 'over') play('gameOver');
    buzz(s === 'over' ? [80, 60, 80, 60, 160] : [60]);
    setScene({ scene: s, sub: s === 'over' || s === 'reveal' ? '' : `Round ${g.round}`, key });
    const t = setTimeout(() => setScene(null), 2200);
    return () => clearTimeout(t);
  }, [key, g?.phase]);

  return scene;
}

export function PhaseCurtain({ scene }: { scene: { scene: Scene; sub: string; key: number } | null }) {
  const { prefs } = usePrefs();
  if (!scene || prefs.reduceMotion) return null;
  return (
    <div key={scene.key} className={`phase-curtain curtain-${scene.scene}`} aria-hidden="true">
      <div className="curtain-inner">
        <svg viewBox="0 0 64 64" width="96" height="96" className="curtain-emblem" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {EMBLEM[scene.scene]}
        </svg>
        <p className="curtain-title">{TITLE[scene.scene]}</p>
        {scene.sub && <p className="curtain-sub">{scene.sub}</p>}
      </div>
    </div>
  );
}
