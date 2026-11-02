import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { useFx, usePrefs } from '../lib/prefs';
import { sounds } from '../lib/sound';
import { RoleArt } from './RoleArt';
import { LOGO } from './ui';
import './intro.css';

const SEEN_KEY = 'mafia-night:intro-seen';

/** Show the welcome once per visit, on the public pages (never inside a running game or on the TV). */
function shouldShow() {
  if (typeof window === 'undefined') return false;
  // Never inside a game or on a TV, and not on join links with a room code (people scanning a QR mid-setup).
  if (/^\/(r|tv|c|ctv|join|charades\/join)\/[A-Za-z0-9]+/.test(window.location.pathname)) return false;
  try {
    return sessionStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}

type Kind = 'hub' | 'mafia' | 'charades' | 'draw';

/** The stage names the game the guest is walking into (and what the three cards turn over to show). */
function gateFor(path: string): { kind: Kind; title: string; whisper: string; label: string; faces: [string, string, string] } {
  if (path.startsWith('/charades')) return { kind: 'charades', title: 'Dumb Charades', whisper: 'Lights. Camera. Overacting!', label: 'Welcome to Bollywood Dumb Charades', faces: ['🎭', '🎥', '🎬'] };
  if (path.startsWith('/draw')) return { kind: 'draw', title: 'Draw the Imposter', whisper: 'Pencils ready. One of you is faking it…', label: 'Welcome to Draw the Imposter', faces: ['✏️', '🎨', '🕵️'] };
  if (path === '/') return { kind: 'hub', title: 'Game Night', whisper: 'Three games. One unforgettable night…', label: 'Welcome to Unsorted', faces: ['🎨', '🎬', 'fedora'] };
  return { kind: 'mafia', title: 'Mafia Night', whisper: 'Trust no one. The night is waiting…', label: 'Welcome to Mafia Night', faces: ['lens', 'cross', 'fedora'] };
}

/** One card's face: a character illustration, or an emoji. */
function CardFace({ face, center }: { face: string; center: boolean }) {
  if (/^[a-z]+$/.test(face)) return <RoleArt art={face} alignment={center ? 'mafia' : 'good'} size={56} />;
  return <span className="in-card-emoji">{face}</span>;
}

type Stage = 'brand' | 'gate' | 'open' | 'gone';

const SPARKS = Array.from({ length: 12 }, (_, i) => i);
const MOTES = Array.from({ length: 16 }, (_, i) => i);

/**
 * The welcome, in three beats (about 5 seconds before "Tap to enter"):
 *  1. Unsorted: a streak of gold light, the ring drops onto the logo's "o" with a flare and
 *     sparks, and the wordmark opens out from it.
 *  2. The stage: velvet curtains, a spotlight, three cards dealt into a fan that turn over one
 *     by one (the last in red), then the game's title with a gold shine, and "Tap to enter".
 *  3. Enter: a fanfare, the curtains sweep open on a burst of light and the site is revealed.
 *
 * Browsers only allow sound after a tap, which is why the stage waits for "Tap to enter".
 * Smoothness rules: every layer is mounted from the start (no pop-in), and only transform and
 * opacity animate (GPU-composited), apart from the small logo wipe.
 */
export function IntroSplash() {
  const [stage, setStage] = useState<Stage>(() => (shouldShow() ? 'brand' : 'gone'));
  const [gate] = useState(() => gateFor(typeof window === 'undefined' ? '/' : window.location.pathname));
  const { prefs } = usePrefs();
  const { play } = useFx();
  const stageRef = useRef(stage);
  stageRef.current = stage;
  const fast = prefs.reduceMotion;

  const finish = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode */
    }
    setStage('gone');
  };

  const enter = () => {
    const st = stageRef.current;
    if (st === 'brand') return setStage('gate'); // tap during the logo skips to the stage
    if (st !== 'gate') return;
    sounds.unlock(); // must happen inside the tap
    setStage('open');
    // Let the curtains start moving first; the sound follows a frame later so it never stalls them.
    requestAnimationFrame(() => setTimeout(() => play(gate.kind === 'charades' ? 'welcomeFilmy' : 'welcome'), 30));
  };

  // Warm up the audio engine once the stage has settled, so "Tap to enter" doesn't hitch.
  useEffect(() => {
    if (stage !== 'gate') return;
    const id = setTimeout(() => sounds.prime(), fast ? 0 : 2900);
    return () => clearTimeout(id);
  }, [stage, fast]);

  // Beat 1 → beat 2 on its own.
  useEffect(() => {
    if (stage !== 'brand') return;
    const t = setTimeout(() => setStage((s) => (s === 'brand' ? 'gate' : s)), fast ? 600 : 2700);
    return () => clearTimeout(t);
  }, [stage, fast]);

  // Beat 3 ends by unmounting once everything has faded (nothing left to pop).
  useEffect(() => {
    if (stage !== 'open') return;
    const t = setTimeout(finish, fast ? 350 : 1500);
    return () => clearTimeout(t);
  }, [stage, fast]);

  useEffect(() => {
    if (stage === 'gone') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        enter();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [stage === 'gone']);

  if (stage === 'gone') return null;
  return (
    <div className={`in-root is-${stage} in-${gate.kind}`} role="dialog" aria-modal="true" aria-label={gate.label} onClick={stage === 'brand' ? enter : undefined}>
      <div className="in-backdrop" aria-hidden="true" />

      {/* The stage set: curtains, a valance, a spotlight and dust in the light. */}
      <div className="in-set" aria-hidden="true">
        <div className="in-curtain in-curtain-l" />
        <div className="in-curtain in-curtain-r" />
        <div className="in-valance" />
        <div className="in-spot" />
        <div className="in-pool" />
        <div className="in-motes">
          {MOTES.map((i) => (
            <span key={i} style={{ left: `${30 + ((i * 23) % 40)}%`, animationDelay: `${(i * 0.61) % 5}s`, animationDuration: `${5 + ((i * 1.3) % 4)}s` }} />
          ))}
        </div>
      </div>
      <div className="in-bloom" aria-hidden="true" />

      {/* Beat 1: Unsorted */}
      <div className="in-layer in-brand" aria-hidden={stage !== 'brand'}>
        <span className="in-streak" />
        <div className="in-logo-box">
          <span className="in-flare" />
          <span className="in-sparks">
            {SPARKS.map((i) => (
              <i key={i} style={{ '--a': `${i * 30 + 8}deg`, '--d': `${70 + (i % 3) * 26}px` } as CSSProperties} />
            ))}
          </span>
          <img src={LOGO.full} alt="Unsorted — Plans worth showing up for." className="in-logo" draggable={false} decoding="async" />
          <img src={LOGO.mark} alt="" className="in-ring" draggable={false} decoding="async" />
        </div>
        <p className="in-presents">presents</p>
      </div>

      {/* Beat 2: the stage */}
      <div className="in-layer in-gate" aria-hidden={stage === 'brand'}>
        <div className="in-cards" aria-hidden="true">
          {(['l', 'r', 'c'] as const).map((side, i) => (
            <div key={side} className={`in-card in-card-${side}`}>
              <div className="in-card-back">
                <img src={LOGO.mark} alt="" draggable={false} />
              </div>
              <div className="in-card-face">
                <CardFace face={gate.faces[side === 'l' ? 0 : side === 'r' ? 1 : 2]} center={side === 'c'} />
              </div>
              {i === 2 && <span className="in-card-burst" />}
            </div>
          ))}
        </div>
        <p className="in-kicker">Unsorted Plans presents</p>
        <h1 className="in-title">
          <span>{gate.title}</span>
        </h1>
        <span className="in-slash" aria-hidden="true" />
        <p className="in-whisper">{gate.whisper}</p>
        <button className="in-enter" onClick={enter} tabIndex={stage === 'gate' ? 0 : -1}>
          <span className="in-enter-ring" aria-hidden="true" />
          Tap to enter
        </button>
        <p className="in-sound">🔊 Sound on for the full effect</p>
      </div>

      <button className="in-skip" onClick={finish}>
        Skip
      </button>
    </div>
  );
}
