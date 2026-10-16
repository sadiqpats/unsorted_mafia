import { useEffect, useState } from 'react';
import { useFx, usePrefs } from '../lib/prefs';
import { sounds } from '../lib/sound';
import { LOGO } from './ui';

const SEEN_KEY = 'mafia-night:intro-seen';

/** Show the welcome once per visit, on the public pages (never inside a running game or on the TV). */
function shouldShow() {
  if (typeof window === 'undefined') return false;
  if (/^\/(r|tv)\//.test(window.location.pathname)) return false;
  try {
    return sessionStorage.getItem(SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}

/**
 * The welcome, in two acts. First the Unsorted Plans logo: the yellow ring spins
 * in, the wordmark opens out of it, "presents". Then the haunted Mafia Night gate.
 * Browsers only allow sound after a tap, so the gate asks the guest to "enter" —
 * that tap starts the sound and swings the doors open.
 */
export function IntroSplash() {
  const [stage, setStage] = useState<'brand' | 'gate' | 'open' | 'gone'>(() => (shouldShow() ? 'brand' : 'gone'));
  const [brandOut, setBrandOut] = useState(false);
  const { prefs } = usePrefs();
  const { play } = useFx();

  const finish = () => {
    try {
      sessionStorage.setItem(SEEN_KEY, '1');
    } catch {
      /* private mode */
    }
    setStage('gone');
  };

  const toGate = () => {
    setBrandOut(true);
    setStage((st) => (st === 'brand' ? 'gate' : st));
  };

  const enter = () => {
    if (stage === 'brand') return toGate();
    if (stage !== 'gate') return;
    sounds.unlock();
    play('welcome');
    setStage('open');
    setTimeout(finish, prefs.reduceMotion ? 400 : 3000);
  };

  // Act one plays on its own, then hands over to the gate.
  useEffect(() => {
    if (stage !== 'brand') return;
    const fast = prefs.reduceMotion;
    const t1 = setTimeout(() => setBrandOut(true), fast ? 900 : 3500);
    const t2 = setTimeout(() => setStage((st) => (st === 'brand' ? 'gate' : st)), fast ? 1200 : 3900);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [stage === 'brand']);

  useEffect(() => {
    if (stage === 'gone') return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
      if (e.key === 'Enter' || e.key === ' ') enter();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
  }, [stage]);

  if (stage === 'gone') return null;
  return (
    <div className={`intro ${stage === 'open' ? 'intro-open' : ''}`} role="dialog" aria-modal="true" aria-label="Welcome to Mafia Night">
      <div className="intro-door intro-door-left" aria-hidden="true" />
      <div className="intro-door intro-door-right" aria-hidden="true" />
      <div className="intro-fog" aria-hidden="true" />
      <div className="intro-dust" aria-hidden="true">
        {Array.from({ length: 22 }, (_, i) => (
          <span key={i} style={{ left: `${(i * 41) % 100}%`, animationDelay: `${(i * 0.37) % 3}s`, animationDuration: `${4 + ((i * 1.3) % 4)}s` }} />
        ))}
      </div>
      {stage !== 'brand' && (
        <div className="intro-content">
          <div className="intro-candle" aria-hidden="true">
            <div className="intro-flame" />
            <div className="intro-wax" />
          </div>
          <p className="intro-presents">Unsorted Plans presents</p>
          <h1 className="intro-title">Mafia Night</h1>
          <p className="intro-whisper">The night is waiting for you…</p>
          <button className="intro-enter" onClick={enter} autoFocus>
            <span className="intro-ring" aria-hidden="true" />
            Tap to enter
          </button>
        </div>
      )}
      {(stage === 'brand' || stage === 'gate') && (
        <div className={`intro-brand ${brandOut ? 'intro-brand-out' : ''}`} onClick={toGate} aria-hidden={brandOut}>
          <div className="intro-brand-burst" aria-hidden="true" />
          <div className="intro-brand-stage">
            <img src={LOGO.mark} alt="" className="intro-brand-ring" draggable={false} />
            <img src={LOGO.full} alt="Unsorted — Plans worth showing up for." className="intro-brand-logo" draggable={false} />
          </div>
          <p className="intro-brand-presents">presents</p>
        </div>
      )}
      <button className="intro-skip" onClick={finish}>
        Skip
      </button>
    </div>
  );
}
