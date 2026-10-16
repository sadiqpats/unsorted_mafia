import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import type { CCommand, CView } from '../../shared/charades/types';
import { SERVER_URL, serverUrl } from '../lib/server';
import type { ConnStatus } from '../lib/useRoom';

export interface CSession {
  code: string;
  token: string;
  kind: 'host' | 'captain';
  name: string;
}

const key = (code: string) => `unsorted:charades:${code.toUpperCase()}`;
const memory = new Map<string, CSession>();

export function saveCSession(s: CSession) {
  memory.set(key(s.code), s);
  try {
    localStorage.setItem(key(s.code), JSON.stringify(s));
  } catch {
    /* private mode: this tab only */
  }
}

export function loadCSession(code: string): CSession | null {
  try {
    const raw = localStorage.getItem(key(code));
    if (raw) return JSON.parse(raw) as CSession;
  } catch {
    /* ignore */
  }
  return memory.get(key(code)) ?? null;
}

export function clearCSession(code: string) {
  memory.delete(key(code));
  try {
    localStorage.removeItem(key(code));
  } catch {
    /* ignore */
  }
}

export type CAck = { ok: boolean; error?: { code: string; message: string } };

function actionId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/** Live connection to a Dumb Charades room (the server pushes a fresh view after every change). */
export function useCharades(code: string, auth: { token?: string; display?: boolean } | null) {
  const [view, setView] = useState<CView | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [endedReason, setEndedReason] = useState<string | null>(null);
  const sock = useRef<Socket | null>(null);
  const offset = useRef(0);

  useEffect(() => {
    if (!auth) return;
    const s = io(`${SERVER_URL}/charades`, {
      auth: { code, ...auth },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 300,
      reconnectionDelayMax: 2000,
      timeout: 45000,
    });
    sock.current = s;
    let stopped = false;
    s.on('connect', () => setStatus('online'));
    s.on('disconnect', (reason) => reason !== 'io server disconnect' && setStatus('offline'));
    s.on('connect_error', (e) => {
      if (e.message === 'unauthorized' || e.message === 'no_room') {
        stopped = true;
        setStatus('denied');
        setEndedReason(
          e.message === 'no_room'
            ? 'This room no longer exists. If the game server restarted (free hosting doesn’t keep games through a restart), the host needs to open a new room.'
            : 'This device isn’t part of that room.',
        );
        s.disconnect();
      } else setStatus('offline');
    });
    s.on('state', (v: CView) => {
      offset.current = v.serverNow - Date.now();
      setView(v);
    });
    s.on('session_ended', (e: { reason: string }) => {
      stopped = true;
      setEndedReason(e.reason);
      setStatus('ended');
    });
    const wake = () => {
      if (stopped) return;
      if (!s.connected) s.connect();
      else s.emit('sync');
    };
    const keepAwake = setInterval(() => !stopped && fetch(serverUrl('/api/health'), { cache: 'no-store' }).catch(() => undefined), 4 * 60_000);
    const onVisible = () => document.visibilityState === 'visible' && wake();
    window.addEventListener('online', wake);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(keepAwake);
      window.removeEventListener('online', wake);
      document.removeEventListener('visibilitychange', onVisible);
      s.disconnect();
    };
  }, [code, auth?.token, auth?.display]);

  const send = useCallback((cmd: CCommand): Promise<CAck> => {
    const s = sock.current;
    const id = actionId();
    const attempt = () =>
      new Promise<CAck>((resolve) => {
        if (!s || !s.connected) return resolve({ ok: false, error: { code: 'offline', message: 'You’re offline — reconnecting…' } });
        s.timeout(6000).emit('cmd', { ...cmd, actionId: id }, (err: unknown, ack: CAck) => resolve(err ? { ok: false, error: { code: 'timeout', message: 'No response from the server.' } } : ack));
      });
    return attempt().then((a) => (a.error?.code === 'timeout' ? attempt() : a));
  }, []);

  const serverNow = useCallback(() => Date.now() + offset.current, []);
  return { view, status, endedReason, send, serverNow };
}

/** Seconds left on the turn clock, updated a few times a second. */
export function useTurnClock(view: CView | null, serverNow: () => number): number | null {
  const t = view?.turn;
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!t || t.stage !== 'acting') return setLeft(null);
    if (t.pausedLeft !== null) return setLeft(Math.ceil(t.pausedLeft / 1000));
    const up = () => setLeft(Math.max(0, Math.ceil(((t.endsAt ?? 0) - serverNow()) / 1000)));
    up();
    const id = setInterval(up, 200);
    return () => clearInterval(id);
  }, [t?.stage, t?.endsAt, t?.pausedLeft, serverNow]);
  return left;
}

export const fmtClock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

export const RESULT_LINE: Record<string, { big: string; sub: string }> = {
  correct: { big: 'Sahi Jawab!', sub: '+1 point' },
  pass: { big: 'Arre Yaar!', sub: 'Passed — no point' },
  timeout: { big: 'Time Khatam!', sub: 'The clock won' },
};
