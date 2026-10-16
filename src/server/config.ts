/** The production website on Vercel is always allowed to call this server. */
export const DEFAULT_CLIENT_ORIGINS = ['https://unsortedmafia.vercel.app'];

/** Allowed browser origins = defaults + CLIENT_ORIGIN (comma-separated, trailing slashes ignored). */
export function resolveClientOrigins(envValue: string | undefined): string[] {
  const extra = (envValue ?? '')
    .split(',')
    .map((o) => o.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return [...new Set([...DEFAULT_CLIENT_ORIGINS, ...extra])];
}
