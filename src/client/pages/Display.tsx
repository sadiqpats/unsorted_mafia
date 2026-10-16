import { useMemo, useState } from 'react';
import { PhaseCurtain, usePhaseFx } from '../components/PhaseCurtain';
import { sounds } from '../lib/sound';
import { useParams } from 'react-router-dom';
import { ROLES, roleAlignment } from '../../shared/roles';
import { Avatar } from '../components/Avatar';
import type { PublicPlayer } from '../../shared/view-types';
import { ConnectionBadge, Feed, LOGO, PHASE_LABEL, QR, Timer } from '../components/ui';
import { useRoom } from '../lib/useRoom';

/** TV / projector view. Connects as a read-only "display" and receives only public data. */
export default function Display() {
  const { code = '' } = useParams();
  const upper = code.toUpperCase();
  const auth = useMemo(() => ({ display: true }), []);
  const { view, status, serverNow, endedReason } = useRoom(upper, auth);
  const joinUrl = `${window.location.origin}/join/${upper}`;
  const scene = usePhaseFx(view);
  const [soundOn, setSoundOn] = useState(false);

  if (status === 'denied' || status === 'ended') return <div className="grid min-h-dvh place-items-center text-2xl text-mute">{endedReason ?? 'Room unavailable'}</div>;
  if (!view) return <div className="grid min-h-dvh place-items-center text-mute">Connecting to {upper}…</div>;

  const g = view.game;
  return (
    <div className="grain relative min-h-dvh p-6 md:p-10">
      <div className="ambient" aria-hidden="true" />
      <PhaseCurtain scene={scene} />
      {!soundOn && (
        <button
          className="btn btn-ghost fixed bottom-5 right-5 z-50 !min-h-10 text-sm"
          onClick={() => {
            sounds.unlock();
            sounds.seal();
            setSoundOn(true);
          }}
        >
          🔊 Tap to enable sound
        </button>
      )}
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <div>
          <div className="flex items-end gap-3">
            <img src={LOGO.wordmark} alt="Unsorted" className="h-9 w-auto md:h-11" />
            <span className="eyebrow pb-1">presents</span>
          </div>
          <h1 className="brand-title mt-1 text-4xl font-black md:text-5xl">Mafia Night</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-[family-name:var(--font-display)] text-3xl tracking-[0.3em] text-gold">{upper}</span>
          <ConnectionBadge status={status} />
        </div>
      </div>

      {!g || view.status === 'lobby' ? (
        <div className="mx-auto mt-12 grid max-w-7xl items-center gap-10 md:grid-cols-[auto_1fr]">
          <div className="card flex flex-col items-center p-6">
            <QR text={joinUrl} size={280} />
            <p className="mt-4 text-mute">Scan to join, or go to</p>
            <p className="text-lg">{window.location.host}/join</p>
            <p className="mt-2 font-[family-name:var(--font-display)] text-5xl tracking-[0.35em]">{upper}</p>
          </div>
          <div>
            <img src={LOGO.full} alt="Unsorted — Plans worth showing up for." className="h-auto w-80 max-w-full" />
            <p className="mt-6 text-xl">
              {view.players.length} / {view.settings.playerCount} players
            </p>
            <PhotoWall players={view.players} lobby settings={view.settings} />
          </div>
        </div>
      ) : (
        <div className="mx-auto mt-10 grid max-w-7xl gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <p className="eyebrow">{g.round ? `Round ${g.round}` : ''}</p>
            <h2 className="font-[family-name:var(--font-display)] text-6xl md:text-7xl">{PHASE_LABEL[g.phase]}</h2>
            <div className="mt-4">
              <Timer endsAt={g.phaseEndsAt} serverNow={serverNow} pausedMs={g.pausedRemainingMs} large />
            </div>
            <p className="mt-4 font-[family-name:var(--font-serif)] text-3xl italic text-mute">
              {
                {
                  reveal: 'Check your phone — privately.',
                  prenight: 'Dawn — everyone makes a choice on their phone.',
                  night: 'Everyone, eyes on your own screen. Make your choice.',
                  morning: 'The town wakes…',
                  discussion: 'Discuss. Accuse. Defend.',
                  voting: 'Discuss, then vote on your phones. Votes are secret.',
                  verdict: 'The town has spoken.',
                  game_over: g.winner?.reason ?? '',
                  lobby: '',
                }[g.phase]
              }
            </p>
            {g.news.length > 0 && (
              <div className="mt-5 space-y-1 rounded-2xl border border-gold/30 bg-black/30 p-4" data-testid="tv-news">
                {g.news.map((n) => (
                  <p key={n.seq} className="font-[family-name:var(--font-serif)] text-2xl leading-snug text-bone">
                    {n.text.replace(/^📣\s*/, '')}
                  </p>
                ))}
              </div>
            )}
            {g.nightProgress && <p className="mt-3 text-xl text-mute">{g.nightProgress.done} / {g.nightProgress.total} locked in</p>}
            {g.votingProgress && <p className="mt-3 text-xl text-mute">{g.votingProgress.done} / {g.votingProgress.total} votes in</p>}
            <div className="mt-8">
              <PhotoWall players={view.players} settings={view.settings} />
            </div>
          </div>
          <div className="card max-h-[75vh] overflow-hidden p-5">
            <h3 className="eyebrow mb-3">Announcements</h3>
            <Feed entries={view.feed} limit={14} inGame />
          </div>
        </div>
      )}
    </div>
  );
}

/** The big-screen wall of faces. Eliminated players' photos are cut in two. */
function PhotoWall({ players, lobby = false, settings }: { players: PublicPlayer[]; lobby?: boolean; settings: Parameters<typeof roleAlignment>[1] }) {
  const n = players.length;
  const size = n <= 8 ? 150 : n <= 12 ? 128 : n <= 16 ? 112 : n <= 22 ? 96 : 84;
  if (!n) return <p className="mt-6 text-xl text-mute">Waiting for the first guest…</p>;
  return (
    <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-6" aria-label="Players">
      {players.map((p) => {
        const r = p.revealedRoleId ? ROLES[p.revealedRoleId] : null;
        const a = p.revealedRoleId ? roleAlignment(p.revealedRoleId, settings) : null;
        return (
          <li key={p.id} className="flex flex-col items-center text-center" style={{ width: size + 8 }} data-player={p.name} data-dead={!p.alive}>
            <Avatar name={p.name} photo={p.photo} dead={!p.alive} size={size} className={lobby && !p.ready ? 'opacity-50' : ''} />
            <div className={`mt-2 w-full truncate text-lg font-semibold ${p.alive ? 'text-bone' : 'text-mute line-through decoration-ember/80'}`}>{p.name}</div>
            <div className="min-h-5 text-xs text-mute">
              {lobby ? (p.ready ? '✓ Ready' : 'Joining…') : !p.alive ? (
                <span className={a === 'mafia' ? 'text-ember' : a === 'neutral' ? 'text-neutral' : 'text-good'}>☠ {r ? r.name : 'Eliminated'}</span>
              ) : p.silenced ? (
                '🤐 Silenced'
              ) : (
                ''
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
