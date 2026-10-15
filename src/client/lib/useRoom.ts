import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { SERVER_URL, serverUrl } from './server';
import type { Ack, CommandInput } from '../../shared/protocol';
import type { ClientView } from '../../shared/view-types';

export type ConnStatus = 'connecting' | 'online' | 'offline' | 'denied' | 'ended';

function newActionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

/**
 * Live connection to a room. The server pushes a fresh, viewer-specific
 * projection after every change; the client never decides game state.
 * socket.io reconnects automatically after network blips and the server
 * re-sends state on every (re)connect.
 */
export function useRoom(code: string, auth: { token?: string; display?: boolean } | null) {
  const [view, setView] = useState<ClientView | null>(null);
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const [endedReason, setEndedReason] = useState<string | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const offsetRef = useRef(0);

  useEffect(() => {
    if (!auth) return;
    const s = io(SERVER_URL || undefined, {
      auth: { code, ...auth },
      transports: ['websocket', 'polling'],
      reconnectionDelay: 300,
      reconnectionDelayMax: 2000,
      timeout: 15000,
    });
    socketRef.current = s;
    let stopped = false;
    s.on('connect', () => setStatus('online'));
    s.on('disconnect', (reason) => {
      if (reason === 'io server disconnect') return; // session_ended handles it
      setStatus('offline');
    });
    s.on('connect_error', (e) => {
      if (e.message === 'unauthorized' || e.message === 'no_room') {
        stopped = true;
        setStatus('denied');
        setEndedReason(
          e.message === 'no_room'
            ? 'This room no longer exists. If the game server restarted (free hosting does not keep games through a restart), the host needs to create a new room.'
            : 'This device is not part of that room.',
        );
        s.disconnect();
      } else setStatus('offline');
    });
    s.on('state', (v: ClientView) => {
      offsetRef.current = v.serverNow - Date.now();
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
    // Free hosting (e.g. Render free) sleeps after ~15 min without HTTP requests, and WebSocket
    // traffic may not count. While a room is open, ping the server every 4 minutes to keep it awake.
    const keepAwake = setInterval(() => {
      if (!stopped) fetch(serverUrl('/api/health'), { cache: 'no-store' }).catch(() => undefined);
    }, 4 * 60_000);
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

  const send = useCallback((cmd: CommandInput): Promise<Ack> => {
    const s = socketRef.current;
    const actionId = newActionId();
    const attempt = () =>
      new Promise<Ack>((resolve) => {
        if (!s || !s.connected) return resolve({ ok: false, error: { code: 'offline', message: 'You are offline — reconnecting…' } });
        s.timeout(5000).emit('cmd', { ...cmd, actionId }, (err: unknown, ack: Ack) => {
          if (err) resolve({ ok: false, error: { code: 'timeout', message: 'No response from the server.' } });
          else resolve(ack);
        });
      });
    // Retry once with the SAME actionId — the server's idempotency keys make this safe.
    return attempt().then((a) => (a.error?.code === 'timeout' ? attempt() : a));
  }, []);

  const serverNow = useCallback(() => Date.now() + offsetRef.current, []);

  return { view, status, endedReason, send, serverNow };
}
