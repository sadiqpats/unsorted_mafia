/**
 * Where the game server lives. Empty (default) = same origin as the website
 * (local dev, or one Render service). For the Vercel + Render split, set
 * VITE_SERVER_URL=https://<your-render-service>.onrender.com in Vercel.
 */
export const SERVER_URL = String(import.meta.env.VITE_SERVER_URL ?? '').replace(/\/+$/, '');

export const serverUrl = (path: string) => (path.startsWith('/') ? SERVER_URL + path : path);
