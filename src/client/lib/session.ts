/**
 * The only thing stored on the device is the player's own session token for a
 * room (their credential). No game state lives in the browser — the server is
 * authoritative and re-sends everything on connect.
 */
export interface Session {
  code: string;
  token: string;
  kind: 'host' | 'player';
  name: string;
}

const key = (code: string) => `mafia-night:session:${code.toUpperCase()}`;

/** Saves the session. Returns false when this browser won't keep it (e.g. Safari with storage blocked). */
export function saveSession(s: Session): boolean {
  memory.set(key(s.code), s);
  try {
    localStorage.setItem(key(s.code), JSON.stringify(s));
    return localStorage.getItem(key(s.code)) !== null;
  } catch {
    return false;
  }
}

const memory = new Map<string, Session>();

/**
 * When the browser won't store the session (Safari "Block all cookies", some in-app browsers),
 * it rides in the page address after # instead, so a reload or a phone waking up keeps the seat.
 * The part after # never leaves the phone (browsers don't send it to any server).
 */
export function sessionHash(s: Session): string {
  try {
    return '#s=' + btoa(unescape(encodeURIComponent(JSON.stringify(s))));
  } catch {
    return '';
  }
}

function fromHash(code: string): Session | null {
  try {
    const m = /[#&]s=([^&]+)/.exec(window.location.hash);
    if (!m) return null;
    const s = JSON.parse(decodeURIComponent(escape(atob(m[1])))) as Session;
    return s && s.code?.toUpperCase() === code.toUpperCase() && typeof s.token === 'string' ? s : null;
  } catch {
    return null;
  }
}

export function loadSession(code: string): Session | null {
  try {
    const raw = localStorage.getItem(key(code));
    if (raw) return JSON.parse(raw) as Session;
  } catch {
    /* ignore */
  }
  const m = memory.get(key(code));
  if (m) return m;
  const h = fromHash(code);
  if (h) memory.set(key(code), h);
  return h;
}

export function clearSession(code: string) {
  try {
    localStorage.removeItem(key(code));
  } catch {
    /* ignore */
  }
  memory.delete(key(code));
}
