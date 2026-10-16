import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { ConnectionBadge, OfflineBanner, PHASE_LABEL, PrefsMenu, Shell } from '../components/ui';
import { usePrefs } from '../lib/prefs';
import { clearSession, loadSession } from '../lib/session';
import { sounds } from '../lib/sound';
import { useRoom } from '../lib/useRoom';
import { HostDashboard } from './HostDashboard';
import { PlayerGame } from './PlayerGame';

export default function Room() {
  const { code = '' } = useParams();
  const upper = code.toUpperCase();
  const session = loadSession(upper);
  const auth = session ? { token: session.token } : null;
  const { view, status, endedReason, send, serverNow } = useRoom(upper, auth);
  const { prefs } = usePrefs();
  const [curtain, setCurtain] = useState<string | null>(null);
  const lastPhase = useRef<string | null>(null);

  // Public phase changes only: identical sound + curtain on every phone.
  const phase = view?.game?.phase ?? view?.status ?? null;
  useEffect(() => {
    if (!phase || phase === lastPhase.current) return;
    const first = lastPhase.current === null;
    lastPhase.current = phase;
    document.body.classList.toggle('night-mode', phase === 'night' || phase === 'prenight');
    if (first) return;
    if (!prefs.muted) {
      if (phase === 'night' || phase === 'prenight') sounds.night();
      if (phase === 'voting') sounds.morning();
      if (phase === 'verdict' || phase === 'game_over') sounds.verdict();
    }
    if (phase === 'prenight' || phase === 'night' || phase === 'voting' || phase === 'game_over') {
      setCurtain(phase === 'prenight' ? 'Dawn…' : phase === 'night' ? 'Night falls…' : phase === 'voting' ? 'Day breaks' : 'The game is over');
      const t = setTimeout(() => setCurtain(null), 2300);
      return () => clearTimeout(t);
    }
  }, [phase, prefs.muted]);
  useEffect(() => () => document.body.classList.remove('night-mode'), []);
  useEffect(() => {
    document.title = view?.game ? `${PHASE_LABEL[view.game.phase]} · Mafia Night` : 'Lobby · Mafia Night';
  }, [view?.game?.phase]);

  if (!session) return <Navigate to={`/join/${upper}`} replace />;

  if (status === 'denied' || status === 'ended') {
    return (
      <Shell>
        <div className="card mx-auto max-w-md p-6 text-center">
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-gold">{status === 'ended' ? 'Session ended' : 'Can’t open this room'}</h1>
          <p className="mt-3 text-mute">{endedReason}</p>
          <div className="mt-5 flex flex-col gap-2">
            <Link
              className="btn btn-primary"
              to={`/join/${upper}`}
              onClick={() => clearSession(upper)}
            >
              Join again
            </Link>
            <Link className="btn btn-ghost" to="/" onClick={() => clearSession(upper)}>
              Home
            </Link>
          </div>
        </div>
      </Shell>
    );
  }

  const isHost = view?.kind === 'host';
  return (
    <Shell
      wide={isHost}
      right={
        <>
          <span className="chip font-[family-name:var(--font-display)] tracking-[0.2em] text-gold">{upper}</span>
          <ConnectionBadge status={status} />
          <PrefsMenu />
        </>
      }
    >
      <OfflineBanner status={status} />
      {curtain && !prefs.reduceMotion && (
        <div className="phase-curtain" aria-hidden="true">
          <p className="brand-title text-4xl font-bold">{curtain}</p>
        </div>
      )}
      {!view ? (
        <div className="grid min-h-[50vh] place-items-center text-mute" role="status">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-2 border-gold border-t-transparent" />
            Connecting to room {upper}…
          </div>
        </div>
      ) : isHost ? (
        <HostDashboard view={view} send={send} serverNow={serverNow} />
      ) : view.me ? (
        <PlayerGame view={view} send={send} serverNow={serverNow} />
      ) : (
        <p className="text-mute">You are not seated in this room.</p>
      )}
    </Shell>
  );
}
