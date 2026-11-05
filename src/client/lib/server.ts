/**
 * Where the game server lives.
 * - VITE_SERVER_URL (set in Vercel) wins when present.
 * - On a *.vercel.app site without it, fall back to the Render game server — a
 *   missing Vercel env var previously made every request go to Vercel itself
 *   (405 errors and socket timeouts).
 * - Otherwise empty = same origin (local dev, or the site served by Render).
 */
/**
 * The gap between the server's clock and this device's. Every message arrives a little late, and
 * by a different amount each time, so taking the latest reading made the countdown jump about.
 * The largest reading is the least delayed one; only a big drop means the device's clock moved.
 */
export function steadyOffset(prev: number | null, measured: number): number {
  return prev === null || measured > prev || prev - measured > 3000 ? measured : prev;
}

export const RENDER_SERVER_URL = 'https://mafia-night-1c5h.onrender.com';

const fromEnv = String(import.meta.env.VITE_SERVER_URL ?? '').trim().replace(/\/+$/, '');
const onVercel = typeof location !== 'undefined' && /\.vercel\.app$/i.test(location.hostname);

export const SERVER_URL = fromEnv || (onVercel ? RENDER_SERVER_URL : '');

export const serverUrl = (path: string) => (path.startsWith('/') ? SERVER_URL + path : path);
