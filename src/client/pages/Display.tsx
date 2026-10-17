import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { PhaseCurtain, usePhaseFx } from '../components/PhaseCurtain';
import { sounds } from '../lib/sound';
import { useParams } from 'react-router-dom';
import { ROLES, roleAlignment, roleArt, roleTitle } from '../../shared/roles';
import { RoleArt } from '../components/RoleArt';
import { Avatar } from '../components/Avatar';
import type { PublicPlayer } from '../../shared/view-types';
import { ConnectionBadge, Feed, LOGO, PHASE_LABEL, QR, Timer, useTitle, winHeadline } from '../components/ui';
import { useRoom } from '../lib/useRoom';

/** TV / projector view. Connects as a read-only "display" and receives only public data. */
export default function Display() {
  useTitle('Mafia Night · TV · Unsorted');
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
    <div className="grain relative flex min-h-dvh flex-col p-5 tv:h-dvh tv:overflow-hidden tv:p-8">
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
      <div className={`mx-auto flex w-full shrink-0 items-center justify-between ${g && view.status !== 'lobby' ? 'max-w-[1800px]' : 'max-w-7xl'}`}>
        <div>
          <div className="flex items-end gap-3">
            <img src={LOGO.wordmark} alt="Unsorted" className="h-[clamp(1.5rem,4.5vh,2.75rem)] w-auto" />
            <span className="eyebrow pb-1">presents</span>
          </div>
          <h1 className="brand-title mt-1 text-[clamp(1.75rem,5.5vh,3rem)] font-black leading-tight">{view.settings.bollywood ? 'Bollywood Mafia Night' : 'Mafia Night'}</h1>
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
            <p className="mt-[2vh] shrink-0 text-xl">
              {view.players.length} / {view.settings.playerCount} players
            </p>
            <FitBox>{(box) => <PhotoWall players={view.players} lobby settings={view.settings} box={box} />}</FitBox>
          </div>
        </div>
      ) : (
        <div className="mx-auto mt-[2.5vh] grid w-full max-w-[1800px] min-h-0 flex-1 gap-8 tv:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)]">
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">{g.round ? `Round ${g.round}` : ''}</p>
                <h2 className="font-[family-name:var(--font-display)] text-[clamp(2.25rem,7vh,3.75rem)] leading-tight">{g.phase === 'game_over' && g.winner ? winHeadline(g.winner.faction, !!view.settings.bollywood) : PHASE_LABEL[g.phase]}</h2>
              </div>
              <Timer endsAt={g.phaseEndsAt} opensAt={g.phaseOpensAt} serverNow={serverNow} pausedMs={g.pausedRemainingMs} large />
            </div>
            <p className="mt-1 shrink-0 font-[family-name:var(--font-serif)] text-[clamp(1.1rem,3.6vh,1.875rem)] italic text-mute">
              {
                {
                  reveal: 'Check your phone — privately.',
                  prenight: 'Dawn — everyone makes a choice on their phone.',
                  night: 'Everyone, eyes on your own screen. Make your choice.',
                  morning: 'The town wakes…',
                  discussion: 'Discuss. Accuse. Defend. The host opens the vote.',
                  voting: 'Vote now — secretly, on your phone.',
                  verdict: 'The town has spoken.',
                  game_over: g.winner?.reason ?? '',
                  lobby: '',
                }[g.phase]
              }
            </p>
            {g.news.length > 0 && (
              <div className="mt-[2vh] shrink-0 space-y-1 rounded-2xl border border-gold/30 bg-black/30 px-4 py-[1.5vh]" data-testid="tv-news">
                {g.news.map((n) => (
                  <p key={n.seq} className="font-[family-name:var(--font-serif)] text-[clamp(1rem,3.2vh,1.5rem)] leading-snug text-bone">
                    {n.text.replace(/^📣\s*/, '')}
                  </p>
                ))}
              </div>
            )}
            {g.nightProgress && <p className="mt-2 shrink-0 text-[clamp(1rem,2.8vh,1.25rem)] text-mute">{g.nightProgress.done} / {g.nightProgress.total} locked in</p>}
            {g.votingProgress && <p className="mt-2 shrink-0 text-[clamp(1rem,2.8vh,1.25rem)] text-mute">{g.votingProgress.done} / {g.votingProgress.total} votes in</p>}
            <FitBox>{(box) => <PhotoWall players={view.players} settings={view.settings} box={box} winners={g.phase === 'game_over' ? (g.winner?.winnerIds ?? []) : null} />}</FitBox>
          </div>
          <div className="card max-h-full min-h-0 self-start overflow-hidden p-5">
            <h3 className="eyebrow mb-3">Announcements</h3>
            <Feed entries={view.feed} limit={14} inGame />
          </div>
        </div>
      )}
    </div>
  );
}

/** The big-screen wall of faces. Eliminated players' photos are cut in two. */
function PhotoWall({ players, lobby = false, settings, winners = null, box }: { players: PublicPlayer[]; lobby?: boolean; settings: Parameters<typeof roleAlignment>[1]; winners?: string[] | null; box: Box | null }) {
  const n = players.length;
  const { size, cols } = fitFaces(n, box);
  if (!n) return <p className="mt-6 text-xl text-mute">Waiting for the first guest…</p>;
  if (winners) return <RevealWall players={players} settings={settings} winners={winners} size={size} cols={cols} />;
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

/**
 * Game over on the TV: every face turns over, one after another, to show who they really were.
 * The first card waits for the "Game Over" curtain to lift; winners keep a gold glow.
 */
function RevealWall({ players, settings, winners, size, cols }: { players: PublicPlayer[]; settings: Parameters<typeof roleAlignment>[1]; winners: string[]; size: number; cols: number | null }) {
  const step = players.length > 16 ? 0.22 : players.length > 8 ? 0.32 : 0.45; // big tables flip faster
  return (
    <ul className="grid gap-x-4 gap-y-3" style={wallGrid(size, cols)} aria-label="Players" data-testid="tv-reveal">
      {players.map((p, i) => {
        const a = p.revealedRoleId ? roleAlignment(p.revealedRoleId, settings) : null;
        const won = winners.includes(p.id);
        const delay = `${2.6 + i * step}s`;
        return (
          <li key={p.id} className="flex min-w-0 flex-col items-center text-center" data-player={p.name} data-dead={!p.alive}>
            <div className={`tv-flip ${won ? 'is-winner' : ''}`} style={{ width: size, height: size, ['--d' as string]: delay }}>
              <div className="tv-flip-inner">
                <div className="tv-flip-face">
                  <Avatar name={p.name} photo={p.photo} dead={!p.alive} size={size} />
                </div>
                <div className={`tv-flip-face tv-flip-back is-${a ?? 'none'}`}>
                  <RoleArt art={roleArt(p.revealedRoleId, settings)} alignment={a} size={Math.round(size * 0.86)} />
                </div>
              </div>
            </div>
            <div className={`mt-1 w-full truncate font-semibold leading-snug ${p.alive ? 'text-bone' : 'text-mute line-through decoration-ember/80'}`} style={{ fontSize: nameFont(size) }}>{p.name}</div>
            <div className="tv-flip-label min-h-4 text-xs leading-4" style={{ ['--d' as string]: delay }}>
              <span className={ALIGN_TEXT[a ?? ''] ?? 'text-mute'}>
                {won && '🏆 '}
                {roleTitle(p.revealedRoleId, settings)}
                {!p.alive && ' · ☠'}
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

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
    <div ref={ref} className="mt-[2vh] min-h-0 flex-1 overflow-hidden" data-testid="tv-wall">
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
const nameFont = (size: number) => Math.round(Math.max(12, Math.min(18, size * 0.19)));
const labelHeight = (size: number) => Math.ceil(nameFont(size) * 1.375) + 4 + 16;

/** The biggest face size (and column count) that fits every player into the box, without scrolling. */
function fitFaces(n: number, box: Box | null): { size: number; cols: number | null } {
  if (!box || n === 0) return { size: n <= 8 ? 140 : n <= 12 ? 118 : n <= 16 ? 104 : n <= 20 ? 92 : 80, cols: null };
  let best = { size: 32, cols: n };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const byWidth = (box.w - GAP_X * (cols - 1)) / cols - PAD;
    let size = Math.min(byWidth, 170);
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
