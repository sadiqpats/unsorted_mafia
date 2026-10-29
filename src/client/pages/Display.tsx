import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PhaseCurtain, usePhaseFx } from '../components/PhaseCurtain';
import { sounds } from '../lib/sound';
import { useParams } from 'react-router-dom';
import { ROLES, roleAlignment, roleTitle } from '../../shared/roles';
import { MomentsOverlay, useMoments } from '../components/Moments';
import { FinaleShow, useFinaleElapsed } from '../components/FinaleShow';
import { Avatar } from '../components/Avatar';
import type { PublicPlayer } from '../../shared/view-types';
import { ConnectionBadge, Feed, LOGO, PHASE_LABEL, Progress, QR, Timer, useTitle } from '../components/ui';
import { useRoom } from '../lib/useRoom';
import { loadSession } from '../lib/session';
import type { CommandInput } from '../../shared/protocol';
import { revealPlan } from '../lib/reveal';

/** TV / projector view. Connects as a read-only "display" and receives only public data. */
export default function Display() {
  useTitle('Mafia Night · TV · Unsorted');
  const { code = '' } = useParams();
  const upper = code.toUpperCase();
  // On the host's own computer (its session is in this browser) the TV also gets the host's
  // Next phase / Pause buttons. Anywhere else it is a read-only display.
  const hostSession = useMemo(() => {
    const ss = loadSession(upper);
    return ss?.kind === 'host' ? ss : null;
  }, [upper]);
  const auth = useMemo(() => (hostSession ? { token: hostSession.token } : { display: true }), [hostSession]);
  const { view, status, serverNow, endedReason, send } = useRoom(upper, auth);
  const joinUrl = `${window.location.origin}/join/${upper}`;
  const scene = usePhaseFx(view);
  const spotlight = useMoments(view);
  const finaleElapsed = useFinaleElapsed(view, serverNow);
  const [soundOn, setSoundOn] = useState(false);

  if (status === 'denied' || status === 'ended') return <div className="grid min-h-dvh place-items-center text-2xl text-mute">{endedReason ?? 'Room unavailable'}</div>;
  if (!view) return <div className="grid min-h-dvh place-items-center text-mute">Connecting to {upper}…</div>;

  const g = view.game;
  return (
    <div className="tv-page grain relative flex min-h-dvh flex-col p-5 tv:h-dvh tv:overflow-hidden tv:p-8">
      <div className="ambient" aria-hidden="true" />
      <PhaseCurtain scene={scene} />
      {g?.phase === 'game_over' && finaleElapsed !== null && <FinaleShow key={g.phaseSeq} view={view} variant="tv" elapsed={finaleElapsed} persist />}
      {spotlight && g && (
        <MomentsOverlay key={spotlight.key} moment={spotlight} view={view} variant="tv" clock={<Timer endsAt={g.phaseEndsAt} opensAt={g.phaseOpensAt} serverNow={serverNow} pausedMs={g.pausedRemainingMs} large />} />
      )}
      {!soundOn && (
        <button
          className="btn btn-ghost fixed left-1/2 top-5 z-50 !min-h-10 -translate-x-1/2 text-sm"
          onClick={() => {
            sounds.unlock();
            sounds.seal();
            setSoundOn(true);
          }}
        >
          🔊 Tap to enable sound
        </button>
      )}
      <div className={`mx-auto flex w-full shrink-0 items-center justify-between ${g && view.status !== 'lobby' ? 'max-w-[1800px]' : 'max-w-7xl'}`}>
        <div>
          <div className="flex items-end gap-3">
            <img src={LOGO.wordmark} alt="Unsorted" className={`w-auto ${g && view.status !== 'lobby' ? 'h-[clamp(1.1rem,3vh,1.8rem)]' : 'h-[clamp(1.5rem,4.5vh,2.75rem)]'}`} />
            <span className="eyebrow pb-1">presents</span>
          </div>
          <h1 className={`brand-title mt-1 font-black leading-tight ${g && view.status !== 'lobby' ? 'text-[clamp(1.2rem,3.6vh,2rem)]' : 'text-[clamp(1.75rem,5.5vh,3rem)]'}`}>{view.settings.bollywood ? 'Bollywood Mafia Night' : 'Mafia Night'}</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-[family-name:var(--font-display)] text-3xl tracking-[0.3em] text-gold">{upper}</span>
          <ConnectionBadge status={status} />
        </div>
      </div>

      {!g || view.status === 'lobby' ? (
        <div className="mx-auto mt-[4vh] grid w-full max-w-7xl min-h-0 flex-1 gap-10 tv:grid-cols-[auto_minmax(0,1fr)]">
          <div className="card flex flex-col items-center self-center p-6 tv:p-[2.5vh]">
            <QR text={joinUrl} size={280} className="tv:!h-[min(280px,34vh)] tv:!w-[min(280px,34vh)]" />
            <p className="mt-[2vh] text-mute">Scan to join, or go to</p>
            <p className="text-lg">{window.location.host}/join</p>
            <p className="mt-2 font-[family-name:var(--font-display)] text-[clamp(1.75rem,6vh,3rem)] tracking-[0.35em]">{upper}</p>
          </div>
          <div className="flex h-full min-h-0 min-w-0 flex-col justify-center">
            <img src={LOGO.full} alt="Unsorted — Plans worth showing up for." className="hidden h-auto w-80 max-w-full shrink-0 [@media(min-height:800px)]:block" />
            <Progress
              className="tv-progress mt-[2vh] w-full max-w-md shrink-0"
              done={view.players.length}
              total={view.settings.playerCount}
              label={view.players.length >= view.settings.playerCount ? 'Everyone’s here' : `Players · waiting for ${view.settings.playerCount - view.players.length} more`}
            />
            <FitBox>{(box) => <PhotoWall players={view.players} lobby settings={view.settings} box={box} />}</FitBox>
          </div>
        </div>
      ) : (
        g.phase !== 'game_over' && <TvGame view={view} serverNow={serverNow} send={hostSession ? send : null} />
      )}
    </div>
  );
}

/** The big-screen wall of faces. Eliminated players' photos are cut in two. */
function PhotoWall({ players: all, lobby = false, settings, box }: { players: PublicPlayer[]; lobby?: boolean; settings: Parameters<typeof roleAlignment>[1]; box: Box | null }) {
  // During the game the living come first and the dead move to the end.
  const players = lobby ? all : [...all.filter((p) => p.alive), ...all.filter((p) => !p.alive)];
  const n = players.length;
  const { size, cols } = fitFaces(n, box);
  if (!n) return <p className="mt-6 text-xl text-mute">Waiting for the first guest…</p>;
  return (
    <ul className="grid gap-x-4 gap-y-3" style={wallGrid(size, cols)} aria-label="Players">
      {players.map((p) => {
        const r = p.revealedRoleId ? ROLES[p.revealedRoleId] : null;
        const a = p.revealedRoleId ? roleAlignment(p.revealedRoleId, settings) : null;
        return (
          <li key={p.id} className="flex min-w-0 flex-col items-center text-center" data-player={p.name} data-dead={!p.alive}>
            <Avatar name={p.name} photo={p.photo} dead={!p.alive} size={size} className={`${lobby && !p.ready ? 'opacity-50' : ''}`} />
            <div className={`mt-1 w-full truncate font-semibold leading-snug ${p.alive ? 'text-bone' : 'text-mute line-through decoration-ember/80'}`} style={{ fontSize: nameFont(size) }}>{p.name}</div>
            <div className="min-h-4 text-xs leading-4 text-mute">
              {lobby ? (p.ready ? '✓ Ready' : 'Joining…') : !p.alive ? (
                <span className={ALIGN_TEXT[a ?? ''] ?? 'text-good'}>☠ {r ? roleTitle(p.revealedRoleId, settings) : 'Eliminated'}</span>
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

const ALIGN_TEXT: Record<string, string> = { mafia: 'text-ember', evil: 'text-[#e07ac8]', neutral: 'text-neutral', good: 'text-good' };

type Box = { w: number; h: number };
const GAP_X = 16;
const GAP_Y = 12;
const PAD = 12; // breathing room around each face, inside its grid cell

/**
 * The space left for the wall of faces. On a TV (wide screen) the page is exactly one screen tall
 * and the wall gets whatever the title, news and progress leave over; on a narrow screen the page
 * just scrolls, so there is no box and the faces use a fixed size.
 */
function FitBox({ children }: { children: (box: Box | null) => React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const box = useBox(ref);
  return (
    <div ref={ref} className="mt-[2vh] flex min-h-0 flex-1 flex-col justify-center overflow-hidden" data-testid="tv-wall">
      {children(box)}
    </div>
  );
}

function useBox(ref: RefObject<HTMLElement | null>): Box | null {
  const [box, setBox] = useState<Box | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const wide = window.matchMedia('(min-width: 768px) and (min-height: 420px) and (orientation: landscape)');
    const measure = () => {
      if (!wide.matches) return setBox(null);
      const r = el.getBoundingClientRect();
      setBox((b) => (b && Math.abs(b.w - r.width) < 2 && Math.abs(b.h - r.height) < 2 ? b : { w: r.width, h: r.height }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    wide.addEventListener('change', measure);
    return () => {
      ro.disconnect();
      wide.removeEventListener('change', measure);
    };
  }, [ref]);
  return box;
}

/** Name + role line under each face. */
const nameFont = (size: number) => Math.round(Math.max(12, Math.min(30, size * 0.17)));
const labelHeight = (size: number) => Math.ceil(nameFont(size) * 1.375) + 4 + 16;

/** The biggest face size (and column count) that fits every player into the box, without scrolling. */
function fitFaces(n: number, box: Box | null): { size: number; cols: number | null } {
  if (!box || n === 0) return { size: n <= 8 ? 140 : n <= 12 ? 118 : n <= 16 ? 104 : n <= 20 ? 92 : 80, cols: null };
  let best = { size: 32, cols: n };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const byWidth = (box.w - GAP_X * (cols - 1)) / cols - PAD;
    let size = Math.min(byWidth, 280);
    // Shrink until the rows (face + label) fit the height.
    for (let guard = 0; guard < 4; guard++) {
      const byHeight = (box.h - GAP_Y * (rows - 1)) / rows - labelHeight(size) - 8;
      if (size <= byHeight) break;
      size = byHeight;
    }
    size = Math.floor(size);
    if (size > best.size) best = { size, cols };
  }
  return best;
}

function wallGrid(size: number, cols: number | null): React.CSSProperties {
  return cols ? { gridTemplateColumns: `repeat(${cols}, ${size + PAD}px)`, justifyContent: 'center' } : { gridTemplateColumns: `repeat(auto-fill, minmax(${size + PAD}px, 1fr))` };
}

const TAGLINE: Record<string, string> = {
  reveal: 'Check your phone — privately.',
  prenight: 'Dawn — make your choice on your phone.',
  night: 'Eyes on your own screen. Make your choice.',
  morning: 'The town wakes…',
  voting: 'Vote now — secretly, on your phone.',
  verdict: 'The town has spoken.',
};

/**
 * The TV during a game. The faces get most of the screen (they must be readable from the back
 * of the room); a slim top bar holds the phase, the counts and the clock; this round's
 * announcements sit in a narrow corner panel (earlier rounds are cleared).
 */
function TvGame({ view, serverNow, send }: { view: NonNullable<ReturnType<typeof useRoom>['view']>; serverNow: () => number; send: ((c: CommandInput) => Promise<unknown>) | null }) {
  const g = view.game!;
  const alive = view.players.filter((p) => p.alive).length;
  const roundFeed = view.feed.filter((e) => e.round === g.round && e.visibility !== 'host');
  const tagline = g.phase === 'discussion' ? (g.phaseEndsAt !== null || (g.pausedRemainingMs ?? -1) >= 0 ? 'Discuss. Accuse. Defend. The vote opens when the clock runs out.' : 'Discuss. Accuse. Defend. The host opens the vote.') : (TAGLINE[g.phase] ?? '');
  return (
    <div className="mx-auto mt-[1.5vh] flex w-full max-w-[1900px] min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <p className="eyebrow">{g.round ? `Round ${g.round}` : ''}</p>
          <h2 key={g.phase} className="phase-title-in font-[family-name:var(--font-display)] text-[clamp(2.4rem,7.5vh,4.4rem)] leading-none">
            {PHASE_LABEL[g.phase]}
          </h2>
          <p className="mt-1 truncate font-[family-name:var(--font-serif)] text-[clamp(1rem,3vh,1.6rem)] italic text-mute">{tagline}</p>
        </div>
        <div className="flex items-center gap-4">
          {g.phase !== 'reveal' && (
            <div className="flex flex-col gap-1.5 text-[clamp(0.9rem,2.4vh,1.2rem)]" data-testid="tv-counts">
              <span className="chip border-ok/40 text-bone">
                <span className="h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
                {alive} alive
              </span>
              <span className="chip border-ember/40 text-bone">
                <span className="h-2 w-2 rounded-full bg-ember" aria-hidden="true" />
                {view.players.length - alive} out
              </span>
            </div>
          )}
          {g.nightProgress && <Progress className="tv-progress w-[clamp(10rem,22vw,16rem)]" done={g.nightProgress.done} total={g.nightProgress.total} label="locked in" />}
          {g.votingProgress && <Progress className="tv-progress w-[clamp(10rem,22vw,16rem)]" done={g.votingProgress.done} total={g.votingProgress.total} label="votes in" />}
          {g.revealProgress && <Progress className="tv-progress w-[clamp(10rem,22vw,16rem)]" done={g.revealProgress.done} total={g.revealProgress.total} label="have seen their role" />}
          <div className="tv-clock-slot">
            <Timer endsAt={g.phaseEndsAt} opensAt={g.phaseOpensAt} serverNow={serverNow} pausedMs={g.pausedRemainingMs} large />
          </div>
          {send && <TvControls view={view} send={send} />}
        </div>
      </div>
      <div className="mt-[1.5vh] grid min-h-0 flex-1 gap-5 tv:grid-cols-[minmax(0,1fr)_minmax(12rem,17rem)]">
        <div className="flex min-h-0 min-w-0 flex-col">
          <FitBox>{(box) => <PhotoWall players={view.players} settings={view.settings} box={box} />}</FitBox>
        </div>
        <aside className="card max-h-full min-h-0 self-end overflow-hidden p-3" data-testid="tv-news">
          <h3 className="eyebrow mb-2 !text-[0.65rem]">Round {g.round} · announcements</h3>
          {roundFeed.length ? <Feed entries={roundFeed} limit={6} inGame /> : <p className="text-sm text-mute">Nothing yet this round.</p>}
        </aside>
      </div>
    </div>
  );
}

/** The host's buttons on the TV (only on the host's own computer). */
function TvControls({ view, send }: { view: NonNullable<ReturnType<typeof useRoom>['view']>; send: (c: CommandInput) => Promise<unknown> }) {
  const g = view.game!;
  const [busy, setBusy] = useState(false);
  const run = async (c: CommandInput) => {
    setBusy(true);
    try {
      await send(c);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-1.5" data-testid="tv-controls">
      <button className="btn btn-gold !min-h-10 !px-4 !py-1.5 text-sm" disabled={busy || !!g.pendingTie} onClick={() => run({ type: 'advance', phaseSeq: g.phaseSeq })}>
        {g.phase === 'discussion' ? '🗳️ Start voting' : 'Next phase ⏭'}
      </button>
      <button className="btn btn-ghost !min-h-10 !px-4 !py-1.5 text-sm" disabled={busy} onClick={() => run({ type: g.paused ? 'resume' : 'pause' })}>
        {g.paused ? '▶ Resume' : '⏸ Pause timer'}
      </button>
    </div>
  );
}
