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

export function saveSession(s: Session) {
  try {
    localStorage.setItem(key(s.code), JSON.stringify(s));
  } catch {
    /* private mode — session lives for this tab only */
    memory.set(key(s.code), s);
  }
}

const memory = new Map<string, Session>();

export function loadSession(code: string): Session | null {
  try {
    const raw = localStorage.getItem(key(code));
    if (raw) return JSON.parse(raw) as Session;
  } catch {
    /* ignore */
  }
  return memory.get(key(code)) ?? null;
}

export function clearSession(code: string) {
  try {
    localStorage.removeItem(key(code));
  } catch {
    /* ignore */
  }
  memory.delete(key(code));
}
