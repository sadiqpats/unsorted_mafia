import { useEffect, useState } from 'react';
import { serverUrl } from '../lib/server';

/**
 * On free hosting the game server sleeps when unused and takes up to a minute to
 * start. We ping it as soon as the site opens, and if it is slow, say so.
 */
export function WakeBanner() {
  const [state, setState] = useState<'checking' | 'slow' | 'awake' | 'down'>('checking');
  useEffect(() => {
    let done = false;
    const slow = setTimeout(() => !done && setState('slow'), 2500);
    const attempt = async (tries: number): Promise<void> => {
      try {
        const r = await fetch(serverUrl('/api/health'), { cache: 'no-store' });
        if (r.ok) {
          done = true;
          setState('awake');
          return;
        }
      } catch {
        /* still starting */
      }
      if (tries > 0) {
        await new Promise((res) => setTimeout(res, 3000));
        return attempt(tries - 1);
      }
      done = true;
      setState('down');
    };
    void attempt(30);
    return () => clearTimeout(slow);
  }, []);
  if (state !== 'slow' && state !== 'down') return null;
  return (
    <div className="fixed inset-x-0 bottom-4 z-[85] mx-auto w-[calc(100%-2rem)] max-w-md" role="status" aria-live="polite">
      <div className="flex items-center gap-3 rounded-xl border border-gold/50 bg-smoke/95 px-4 py-3 text-sm shadow-2xl backdrop-blur">
        {state === 'slow' && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-gold border-t-transparent" aria-hidden="true" />}
        <span>
          {state === 'slow'
            ? 'Waking up the game server… on free hosting this can take up to a minute. Hang tight.'
            : 'The game server isn’t answering. Check your connection and refresh in a minute.'}
        </span>
      </div>
    </div>
  );
}
