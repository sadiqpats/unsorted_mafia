import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { sounds } from './sound';

/** Per-device preferences (not game state): sound, motion, low-light. */
export interface Prefs {
  muted: boolean;
  /** 0–1 */
  volume: number;
  vibration: boolean;
  reduceMotion: boolean;
  lowLight: boolean;
  /** Keep the screen on during a game (Screen Wake Lock). */
  keepAwake: boolean;
  /** Suspense music during Dawn and Night in online games. */
  music: boolean;
}

const KEY = 'mafia-night:prefs';
const defaults: Prefs = { muted: false, volume: 0.8, vibration: true, reduceMotion: false, lowLight: false, keepAwake: true, music: true };

function load(): Prefs {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) ?? '{}') };
  } catch {
    return defaults;
  }
}

const Ctx = createContext<{ prefs: Prefs; set: (p: Partial<Prefs>) => void }>({ prefs: defaults, set: () => {} });

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(load);
  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
    const root = document.documentElement;
    root.classList.toggle('reduce-motion', prefs.reduceMotion);
    root.classList.toggle('low-light', prefs.lowLight);
    sounds.setVolume(prefs.volume);
  }, [prefs]);
  return <Ctx.Provider value={{ prefs, set: (p) => setPrefs((x) => ({ ...x, ...p })) }}>{children}</Ctx.Provider>;
}

export const usePrefs = () => useContext(Ctx);

type Cue = Exclude<keyof typeof sounds, 'setVolume' | 'unlock'>;

/**
 * Set while a player's phone is in an offline (same-room) game: game sounds come from the
 * host's device and the TV instead, so phones stay quiet. Set/cleared by useGameAudio.
 */
export const phoneQuiet = { on: false };

/** The last cues this device actually played (diagnostics; read by the end-to-end tests). */
export const soundLog: string[] = [];
if (typeof window !== 'undefined') (window as unknown as { __unsortedSound: unknown }).__unsortedSound = { log: soundLog };

/** Play a sound cue / vibrate, honouring the player's mute, volume and vibration settings. */
export function useFx() {
  const { prefs } = usePrefs();
  const play = useCallback(
    (cue: Cue) => {
      if (prefs.muted || prefs.volume <= 0 || phoneQuiet.on) return;
      sounds[cue]();
      soundLog.push(cue);
      if (soundLog.length > 60) soundLog.shift();
    },
    [prefs.muted, prefs.volume],
  );
  const buzz = useCallback(
    (pattern: number | number[]) => {
      if (prefs.vibration && typeof navigator !== 'undefined' && 'vibrate' in navigator) navigator.vibrate(pattern);
    },
    [prefs.vibration],
  );
  return { play, buzz };
}
