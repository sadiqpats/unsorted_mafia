import { useEffect } from 'react';
import type { Socket } from 'socket.io-client';
import { usePrefs } from './prefs';

/**
 * Catches "zombie" connections. A phone coming back from the lock screen or another
 * app can look connected while its socket is actually dead; socket.io would only
 * notice after ~70 seconds. We ask the server "are you there?" every 15 seconds
 * while the page is visible, and immediately when it becomes visible again. No
 * answer within a few seconds → reconnect at once (the server re-sends the full
 * game state on connect, and the seat is kept).
 */
export function watchConnection(s: Socket, stopped: () => boolean, onHealth?: (ok: boolean) => void) {
  // A slow answer is not a dead line: the free server can take a few seconds when it's busy.
  // Only a phone back from the background (a likely dead socket) redials after one miss;
  // the regular check needs two misses in a row, so a busy server doesn't trigger a stampede of reconnects.
  let misses = 0;
  let inFlight = false;
  const probe = (resync: boolean, fromBackground: boolean) => {
    if (stopped() || inFlight) return;
    if (!s.connected) {
      s.connect();
      return;
    }
    inFlight = true;
    s.timeout(fromBackground ? 6000 : 10_000).emit('alive', (err: unknown) => {
      inFlight = false;
      if (stopped()) return;
      if (err) {
        misses++;
        onHealth?.(false); // show "Connection lost" at once; redial only after the second miss

        if (fromBackground || misses >= 2) {
          misses = 0;
          s.disconnect();
          s.connect();
        }
      } else {
        misses = 0;
        onHealth?.(true);
        if (resync) s.emit('sync');
      }
    });
  };
  const onVisible = () => document.visibilityState === 'visible' && probe(true, true);
  const onOnline = () => probe(true, true);
  const onOffline = () => onHealth?.(false);
  const onFocus = () => probe(false, false);
  const timer = setInterval(() => document.visibilityState === 'visible' && probe(false, false), 15_000);
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('online', onOnline);
  window.addEventListener('offline', onOffline);
  window.addEventListener('focus', onFocus);
  window.addEventListener('pageshow', onVisible);
  return () => {
    clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('pageshow', onVisible);
  };
}

type Sentinel = { release: () => Promise<void>; addEventListener: (t: 'release', f: () => void) => void };

/**
 * Keeps the screen on while a game is open (Screen Wake Lock API: Chrome/Android,
 * Safari on iOS 16.4+). A locked screen is the #1 reason phones drop out of a
 * game. The lock is re-taken whenever the page becomes visible again, and on the
 * first tap if the browser wanted a gesture. Players can switch it off in Settings.
 */
export function useWakeLock(active: boolean) {
  const { prefs } = usePrefs();
  const on = active && prefs.keepAwake;
  useEffect(() => {
    const wl = (navigator as unknown as { wakeLock?: { request: (t: 'screen') => Promise<Sentinel> } }).wakeLock;
    if (!on || !wl) return;
    let lock: Sentinel | null = null;
    let busy = false;
    let done = false;
    const take = async () => {
      if (done || lock || busy || document.visibilityState !== 'visible') return;
      busy = true;
      try {
        lock = await wl.request('screen');
        lock.addEventListener('release', () => (lock = null));
        if (done) void lock.release();
      } catch {
        /* not allowed right now (e.g. battery saver) — try again on the next tap */
      } finally {
        busy = false;
      }
    };
    void take();
    const onVisible = () => void take();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pointerdown', onVisible);
    return () => {
      done = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pointerdown', onVisible);
      void lock?.release().catch(() => undefined);
    };
  }, [on]);
}
