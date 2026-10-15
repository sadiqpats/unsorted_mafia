import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

/** Per-device preferences (not game state): sound, motion, low-light. */
export interface Prefs {
  muted: boolean;
  reduceMotion: boolean;
  lowLight: boolean;
}

const KEY = 'mafia-night:prefs';
const defaults: Prefs = { muted: false, reduceMotion: false, lowLight: false };

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
  }, [prefs]);
  return <Ctx.Provider value={{ prefs, set: (p) => setPrefs((x) => ({ ...x, ...p })) }}>{children}</Ctx.Provider>;
}

export const usePrefs = () => useContext(Ctx);
