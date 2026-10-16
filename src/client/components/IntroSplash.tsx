import { useEffect, useRef, useState } from 'react';
import { useFx, usePrefs } from '../lib/prefs';
import { sounds } from '../lib/sound';
import { LOGO } from './ui';

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

/** Act two names the game the guest is walking into. */
function gateFor(path: string) {
  if (path.startsWith('/charades')) return { title: 'Dumb Charades', whisper: 'Lights. Camera. Action!', label: 'Welcome to Bollywood Dumb Charades' };
  if (path === '/') return { title: 'Game Night', whisper: 'Two games. One unforgettable night…', label: 'Welcome to Unsorted' };
  return { title: 'Mafia Night', whisper: 'The night is waiting for you…', label: 'Welcome to Mafia Night' };
}

type Stage = 'brand' | 'gate' | 'open' | 'gone';

/**
 * The welcome, in three beats:
 *  1. Unsorted: the yellow ring spins in on a warm glow and the wordmark opens out of it.
 *  2. A cross-fade to the gate ("Game Night" / "Mafia Night" / "Dumb Charades") — candle, title, "Tap to enter".
 *  3. Enter: the doors slide apart on a burst of light and the site is revealed.
 *
 * Smoothness rules: every layer is mounted from the start (no pop-in), and only
 * transform + opacity are animated (GPU-composited — no blur filters, 3D swings or
 * letter-spacing animations, which stutter on phones). Browsers only allow sound
 * after a tap, so the sound starts on "Tap to enter".
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
    if (st === 'brand') return setStage('gate'); // tap during the logo skips to the gate
    if (st !== 'gate') return;
    sounds.unlock(); // must happen inside the tap
    setStage('open');
    // Let the doors start moving first; the sound follows a beat later so it never stalls the animation.
    requestAnimationFrame(() => setTimeout(() => play('welcome'), 60));
  };

  // Warm up the audio engine once the gate has settled (nothing else is moving), so "Tap to enter" doesn't hitch.
  useEffect(() => {
    if (stage !== 'gate') return;
    const id = setTimeout(() => sounds.prime(), fast ? 0 : 1500);
    return () => clearTimeout(id);
  }, [stage, fast]);

  // Beat 1 → beat 2 on its own.
  useEffect(() => {
    if (stage !== 'brand') return;
    const t = setTimeout(() => setStage((s) => (s === 'brand' ? 'gate' : s)), fast ? 700 : 3350); // the logo starts after the page has settled
    return () => clearTimeout(t);
  }, [stage, fast]);

  // Beat 3 ends by unmounting once everything has faded (nothing left to pop).
  useEffect(() => {
    if (stage !== 'open') return;
    const t = setTimeout(finish, fast ? 350 : 1250);
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
    <div className={`in-root is-${stage}`} role="dialog" aria-modal="true" aria-label={gate.label} onClick={stage === 'brand' ? enter : undefined}>
      <div className="in-backdrop" aria-hidden="true" />
      <div className="in-door in-door-l" aria-hidden="true" />
      <div className="in-door in-door-r" aria-hidden="true" />
      <div className="in-haze" aria-hidden="true" />
      <div className="in-motes" aria-hidden="true">
        {Array.from({ length: 14 }, (_, i) => (
          <span key={i} style={{ left: `${(i * 37 + 7) % 100}%`, animationDelay: `${(i * 0.53) % 4}s`, animationDuration: `${6 + ((i * 1.7) % 5)}s` }} />
        ))}
      </div>
      <div className="in-bloom" aria-hidden="true" />

      {/* Beat 1: Unsorted */}
      <div className="in-layer in-brand" aria-hidden={stage !== 'brand'}>
        <div className="in-halo" />
        <div className="in-logo-box">
          <img src={LOGO.mark} alt="" className="in-ring" draggable={false} decoding="async" />
          <img src={LOGO.full} alt="Unsorted — Plans worth showing up for." className="in-logo" draggable={false} decoding="async" />
        </div>
        <p className="in-presents">presents</p>
      </div>

      {/* Beat 2: the gate */}
      <div className="in-layer in-gate" aria-hidden={stage === 'brand'}>
        <div className="in-candle" aria-hidden="true">
          <div className="in-flame" />
          <div className="in-wax" />
        </div>
        <p className="in-kicker">Unsorted Plans presents</p>
        <h1 className="in-title">{gate.title}</h1>
        <p className="in-whisper">{gate.whisper}</p>
        <button className="in-enter" onClick={enter} tabIndex={stage === 'gate' ? 0 : -1}>
          <span className="in-enter-ring" aria-hidden="true" />
          Tap to enter
        </button>
      </div>

      <button className="in-skip" onClick={finish}>
        Skip
      </button>
    </div>
  );
}
