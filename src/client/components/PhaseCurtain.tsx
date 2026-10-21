import { useEffect, useRef, useState, type ReactElement } from 'react';
import type { ClientView } from '../../shared/view-types';
import { phoneQuiet, useFx, usePrefs } from '../lib/prefs';
import { revealPlan } from '../lib/reveal';
import { finale } from '../lib/finale';
import { music } from '../lib/sound';
import type { EventTag } from '../../shared/types';

type Scene = 'dawn' | 'night' | 'day' | 'vote' | 'runoff' | 'tie' | 'over' | 'reveal';

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
  vote: (
    <>
      <rect x="14" y="30" width="36" height="22" rx="3" />
      <path d="M22 30v-4h20v4" />
      <path d="M26 18h12v14H26z" className="curtain-rise" />
      <path d="M29 23h6M29 27h4" opacity="0.6" />
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
  vote: 'Time to Vote',
  runoff: 'Runoff Vote',
  tie: 'A Tie',
  over: 'The End',
  reveal: 'Your Role Awaits',
};

/** Bollywood Mafia Night: the same moments, filmi style. */
const TITLE_BW: Record<Scene, string> = {
  dawn: 'Subah Ho Gayi',
  night: 'Raat Ho Gayi',
  day: 'Din Nikal Aaya',
  vote: 'Faisla Karo!',
  runoff: 'Phir Se Vote',
  tie: 'Barabar Ki Takkar',
  over: 'Picture Khatam',
  reveal: 'Aapka Kirdaar',
};

/** A full-screen flash that lands with each big news line (public events only — never a secret). */
type Flash = 'blood' | 'heal' | 'gold' | 'hush' | 'shadow' | 'joker';
const FLASH: Partial<Record<EventTag, Flash>> = {
  kill: 'blood',
  voteout: 'blood',
  removed: 'blood',
  saved: 'heal',
  restored: 'heal',
  revive: 'gold',
  'win-town': 'gold',
  'win-mafia': 'blood',
  'win-other': 'gold',
  silence: 'hush',
  theft: 'shadow',
  joker: 'joker',
};
const FX_EVENT = 'unsorted-fx';
const fxFlash = (kind: Flash) => window.dispatchEvent(new CustomEvent(FX_EVENT, { detail: kind }));

const CUE: Partial<Record<EventTag, Parameters<ReturnType<typeof useFx>['play']>[0]>> = {
  kill: 'kill',
  quiet: 'relief',
  saved: 'saved',
  revive: 'revive',
  silence: 'silence',
  theft: 'theft',
  'dawn-quiet': 'dawn',
  voteout: 'voteOut',
  spared: 'relief',
  tie: 'tension',
  runoff: 'tension',
  joker: 'joker',
  'win-town': 'winTown',
  'win-mafia': 'winMafia',
  'win-other': 'gameOver',
  removed: 'voteOut',
  restored: 'saved',
};

/**
 * The game's sound director and phase transitions.
 *
 * - Every phase change shows a short full-screen moment (same on every screen).
 * - Sounds: a phase cue, then — if something big happened — a tension build, then one
 *   sound per news line, landing exactly when that line appears (see revealPlan).
 * - Online games: suspense music on every device during Dawn and Night; it fades out
 *   before every reveal and stops for the Day.
 * - Offline games (same room): no music, and player phones stay silent — the host's
 *   device and the TV carry the sound.
 * All cues are public events, so a sound never reveals anyone's role.
 */
export function usePhaseFx(view: ClientView | null) {
  const { play, buzz } = useFx();
  const { prefs } = usePrefs();
  const [scene, setScene] = useState<CurtainScene | null>(null);
  const last = useRef<number | null>(null);
  const lastSeq = useRef<number | null>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const g = view?.game ?? null;
  const key = g ? g.phaseSeq : -1;
  const online = view?.settings.playMode === 'online';
  const quietPhone = !online && view?.kind === 'player';
  const musicPhase = !!g && view?.status === 'active' && (g.phase === 'prenight' || g.phase === 'night');
  const wantMusic = online && musicPhase && prefs.music && !prefs.muted && prefs.volume > 0;
  const feedTop = view?.feed.length ? view.feed[view.feed.length - 1].seq : 0;
  // Latest wishes, read by delayed callbacks (so muting mid-reveal is respected).
  const wantRef = useRef(wantMusic);
  wantRef.current = wantMusic;
  const revealUntil = useRef(0);

  // Player phones in a same-room game stay silent.
  useEffect(() => {
    phoneQuiet.on = quietPhone;
    return () => {
      phoneQuiet.on = false;
    };
  }, [quietPhone]);

  // Leaving the room ends everything.
  useEffect(
    () => () => {
      timers.current.forEach(clearTimeout);
      music.stop(0.6);
    },
    [],
  );

  // Music follows the phase (and the player's mute / music settings).
  useEffect(() => {
    if (!wantMusic) {
      if (music.playing) music.stop(1.2);
      return;
    }
    // Normally the reveal sequence below starts it once the news is out; this catches
    // joining mid-night and turning sound back on.
    const t = setTimeout(() => {
      if (wantRef.current && !music.playing && Date.now() >= revealUntil.current) music.start();
    }, 600);
    timers.current.push(t);
  }, [wantMusic, key]);

  useEffect(() => {
    const body = document.body;
    const phase = g?.phase ?? 'lobby';
    const cls = phase === 'prenight' ? 'phase-dawn' : phase === 'night' ? 'phase-night' : phase === 'voting' || phase === 'discussion' || phase === 'verdict' ? 'phase-day' : phase === 'game_over' ? 'phase-over' : 'phase-lobby';
    body.classList.remove('phase-dawn', 'phase-night', 'phase-day', 'phase-over', 'phase-lobby', 'night-mode');
    body.classList.add(cls);
    if (phase === 'night' || phase === 'prenight') body.classList.add('night-mode');
  }, [g?.phase]);
  useEffect(() => () => document.body.classList.remove('phase-dawn', 'phase-night', 'phase-day', 'phase-over', 'phase-lobby', 'night-mode'), []);

  useEffect(() => {
    if (!view) return;
    const firstSeen = lastSeq.current === null;
    const fresh = firstSeen ? [] : view.feed.filter((e) => e.seq > (lastSeq.current ?? 0) && e.tag);
    lastSeq.current = feedTop;
    const phaseChanged = !!g && last.current !== null && last.current !== key;
    const firstPhase = !!g && last.current === null;
    if (g) last.current = key;
    if (firstPhase || (!phaseChanged && !fresh.length)) return; // don't replay when (re)joining

    const later = (sec: number, fn: () => void) => timers.current.push(setTimeout(fn, sec * 1000));

    if (phaseChanged && g) {
      timers.current.forEach(clearTimeout);
      timers.current = [];
      // Music always pauses for a reveal.
      if (music.playing) music.stop(0.8);
      let s: Scene | null = null;
      if (g.phase === 'prenight') s = 'dawn';
      else if (g.phase === 'night') s = 'night';
      else if (g.phase === 'discussion') s = 'day';
      else if (g.phase === 'voting') s = g.runoff ? 'runoff' : 'vote';
      else if (g.phase === 'verdict' && g.pendingTie) s = 'tie'; // the plain pause after a vote has no curtain: its cards are the moment
      else if (g.phase === 'game_over') s = 'over';
      else if (g.phase === 'reveal') s = 'reveal';
      if (s) {
        if (s === 'dawn') play('dawn');
        if (s === 'night') play('night');
        if (s === 'day') play('day');
        if (s === 'runoff' || s === 'vote') play('tension');
        buzz(s === 'over' ? [80, 60, 80, 60, 160] : [60]);
        setScene({ scene: s, sub: s === 'over' || s === 'reveal' ? '' : `Round ${g.round}`, key, bw: !!view.settings.bollywood });
        later(2.2, () => setScene(null));
      }
    }

    // Game over: suspense first, the cards turn (a gong for each Mafia member), and the winner's
    // sound and flash only when the last card has turned — same timeline as the TV and phones.
    const finaleNow = phaseChanged && g?.phase === 'game_over';
    if (finaleNow && view) {
      const fin = finale(view.players, view.settings);
      later(fin.suspenseAt, () => play('riser'));
      later(fin.suspenseAt + 1.4, () => play('tension'));
      for (const grp of fin.groups) {
        if (grp.key !== 'mafia') later(grp.start, () => play('whoosh'));
        else for (const p of grp.players) later((fin.cardAt.get(p.id) ?? grp.start) + 0.2, () => play('gong'));
      }
      const winTag = g!.news.find((n) => n.tag?.startsWith('win-'))?.tag;
      later(fin.end, () => {
        const cue = winTag && CUE[winTag];
        if (cue) play(cue);
        const flash = winTag && FLASH[winTag];
        if (flash && !prefs.reduceMotion) fxFlash(flash);
        buzz([60, 40, 60, 40, 200]);
      });
    }

    // One sound per news line, timed with its appearance on screen.
    const news = (phaseChanged && g ? g.news : fresh).filter((n) => !(finaleNow && n.tag?.startsWith('win-')));
    const plan = revealPlan(news);
    if (phaseChanged && plan.dramatic) later(Math.max(0, plan.at(0) - 1.35), () => play('riser'));
    news.forEach((n, i) => {
      const cue = n.tag && CUE[n.tag];
      const flash = n.tag && FLASH[n.tag];
      if (!cue && !flash) return;
      later(phaseChanged ? plan.at(i) : i * 1.4, () => {
        if (cue) play(cue);
        if (flash && !prefs.reduceMotion) fxFlash(flash);
        if (n.tag === 'kill' || n.tag === 'voteout') buzz([40, 30, 120]);
      });
    });

    // Back to the suspense once the news is out (online, Dawn/Night only).
    if (phaseChanged) {
      revealUntil.current = Date.now() + plan.end * 1000;
      later(plan.end, () => wantRef.current && !music.playing && music.start());
    }
  }, [key, feedTop]);

  return scene;
}

type CurtainScene = { scene: Scene; sub: string; key: number; bw?: boolean };

/** Per-scene sparkle: stars at night, sun motes at dawn/day, embers for a vote, gold at the end. */
const PARTICLES: Record<Scene, number> = { dawn: 14, night: 22, day: 14, vote: 16, runoff: 16, tie: 12, over: 26, reveal: 10 };

export function PhaseCurtain({ scene }: { scene: CurtainScene | null }) {
  const { prefs } = usePrefs();
  return (
    <>
      <FxLayer />
      {scene && !prefs.reduceMotion && (
        <div key={scene.key} className={`phase-curtain curtain-${scene.scene}`} aria-hidden="true">
          <div className="curtain-bar curtain-bar-top" />
          <div className="curtain-bar curtain-bar-bottom" />
          <div className="curtain-burst" />
          <div className="curtain-particles">
            {Array.from({ length: PARTICLES[scene.scene] }, (_, i) => (
              <span key={i} style={{ left: `${(i * 41 + 13) % 100}%`, top: `${(i * 67 + 29) % 100}%`, animationDelay: `${((i * 0.37) % 1.2).toFixed(2)}s`, ['--dx' as string]: `${((i * 53) % 60) - 30}px` }} />
            ))}
          </div>
          <div className="curtain-inner">
            <div className="curtain-ring" />
            <svg viewBox="0 0 64 64" width="96" height="96" className="curtain-emblem" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {EMBLEM[scene.scene]}
            </svg>
            <p className="curtain-title" data-text={(scene.bw ? TITLE_BW : TITLE)[scene.scene]}>
              {(scene.bw ? TITLE_BW : TITLE)[scene.scene]}
            </p>
            {scene.sub && <p className="curtain-sub">{scene.bw ? `${scene.sub} · ${TITLE[scene.scene]}` : scene.sub}</p>}
          </div>
        </div>
      )}
    </>
  );
}

/** Listens for big public moments and flashes the whole screen (kill = red + shake, save = green, revive = gold…). */
function FxLayer() {
  const [flash, setFlash] = useState<{ kind: Flash; n: number } | null>(null);
  useEffect(() => {
    let n = 0;
    let clear: ReturnType<typeof setTimeout> | undefined;
    const on = (e: Event) => {
      const kind = (e as CustomEvent<Flash>).detail;
      setFlash({ kind, n: ++n });
      if (kind === 'blood') {
        document.body.classList.remove('fx-shake');
        void document.body.offsetWidth; // restart the shake
        document.body.classList.add('fx-shake');
      }
      clearTimeout(clear);
      clear = setTimeout(() => {
        setFlash(null);
        document.body.classList.remove('fx-shake');
      }, 1400);
    };
    window.addEventListener(FX_EVENT, on);
    return () => {
      window.removeEventListener(FX_EVENT, on);
      clearTimeout(clear);
      document.body.classList.remove('fx-shake');
    };
  }, []);
  if (!flash) return null;
  return <div key={flash.n} className={`fx-flash fx-${flash.kind}`} aria-hidden="true" data-testid="fx-flash" />;
}
