import { useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react';
import { PhaseCurtain, usePhaseFx } from '../components/PhaseCurtain';
import { sounds } from '../lib/sound';
import { useParams } from 'react-router-dom';
import { ROLES, roleAlignment, roleArt, roleShort, roleTitle } from '../../shared/roles';
import { RoleArt } from '../components/RoleArt';
import { MomentsOverlay, useMoments } from '../components/Moments';
import { finale } from '../lib/finale';
import { Avatar } from '../components/Avatar';
import type { PublicPlayer } from '../../shared/view-types';
import { ConnectionBadge, Feed, LOGO, PHASE_LABEL, QR, Timer, useTitle, winHeadline, Confetti } from '../components/ui';
import { useRoom } from '../lib/useRoom';
import { revealPlan } from '../lib/reveal';

/** TV / projector view. Connects as a read-only "display" and receives only public data. */
export default function Display() {
  useTitle('Mafia Night · TV · Unsorted');
  const { code = '' } = useParams();
  const upper = code.toUpperCase();
  const auth = useMemo(() => ({ display: true }), []);
  const { view, status, serverNow, endedReason } = useRoom(upper, auth);
  const joinUrl = `${window.location.origin}/join/${upper}`;
  const scene = usePhaseFx(view);
  const spotlight = useMoments(view);
  const { done: finaleDone, replay: finaleReplay } = useFinale(view);
  const [soundOn, setSoundOn] = useState(false);

  if (status === 'denied' || status === 'ended') return <div className="grid min-h-dvh place-items-center text-2xl text-mute">{endedReason ?? 'Room unavailable'}</div>;
  if (!view) return <div className="grid min-h-dvh place-items-center text-mute">Connecting to {upper}…</div>;

  const g = view.game;
  return (
    <div className="grain relative flex min-h-dvh flex-col p-5 tv:h-dvh tv:overflow-hidden tv:p-8">
      <div className="ambient" aria-hidden="true" />
      <PhaseCurtain scene={scene} />
      {spotlight && g && (
        <MomentsOverlay key={spotlight.key} moment={spotlight} view={view} variant="tv" clock={<Timer endsAt={g.phaseEndsAt} opensAt={g.phaseOpensAt} serverNow={serverNow} pausedMs={g.pausedRemainingMs} large />} />
      )}
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
        <div className={`mx-auto mt-[2.5vh] grid w-full max-w-[1800px] min-h-0 flex-1 gap-8 ${g.phase === 'game_over' ? '' : 'tv:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)]'}`}>
          <div className="flex min-h-0 min-w-0 flex-col">
            <div className="flex shrink-0 flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">{g.round ? `Round ${g.round}` : ''}</p>
                <h2 key={finaleDone ? 'won' : 'wait'} className={`font-[family-name:var(--font-display)] text-[clamp(2.25rem,7vh,3.75rem)] leading-tight ${g.phase === 'game_over' && finaleDone ? 'headline-drop-now' : ''}`}>
                  {g.phase === 'game_over' && g.winner ? (finaleDone ? winHeadline(g.winner.faction, !!view.settings.bollywood) : 'The truth comes out…') : PHASE_LABEL[g.phase]}
                </h2>
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
                  discussion: g.phaseEndsAt !== null || (g.pausedRemainingMs ?? -1) >= 0 ? 'Discuss. Accuse. Defend. The vote opens when the clock runs out.' : 'Discuss. Accuse. Defend. The host opens the vote.',
                  voting: 'Vote now — secretly, on your phone.',
                  verdict: 'The town has spoken.',
                  game_over: finaleDone ? (g.winner?.reason ?? '') : 'Every card turns over — the Mafia first.',
                  lobby: '',
                }[g.phase]
              }
            </p>
            {g.phase !== 'game_over' && g.phase !== 'reveal' && (
              <p className="mt-1 flex shrink-0 gap-3 text-[clamp(0.95rem,2.6vh,1.25rem)]" data-testid="tv-counts">
                <span className="chip border-ok/40 text-bone">
                  <span className="h-2 w-2 rounded-full bg-ok" aria-hidden="true" />
                  {view.players.filter((p) => p.alive).length} alive
                </span>
                <span className="chip border-ember/40 text-bone">
                  <span className="h-2 w-2 rounded-full bg-ember" aria-hidden="true" />
                  {view.players.filter((p) => !p.alive).length} out
                </span>
              </p>
            )}
            {g.news.length > 0 && g.phase !== 'game_over' && (
              <div className="mt-[2vh] shrink-0 space-y-1 rounded-2xl border border-gold/30 bg-black/30 px-4 py-[1.5vh]" data-testid="tv-news">
                {g.news.map((n, i) => (
                  <p key={n.seq} className={`news-line ${n.tag ? `news-${n.tag}` : ''} font-[family-name:var(--font-serif)] text-[clamp(1rem,3.2vh,1.5rem)] leading-snug text-bone`} style={{ animationDelay: `${revealPlan(g.news).at(i) - 0.9}s` }}>
                    {n.text.replace(/^📣\s*/, '')}
                  </p>
                ))}
              </div>
            )}
            {g.nightProgress && <p className="mt-2 shrink-0 text-[clamp(1rem,2.8vh,1.25rem)] text-mute">{g.nightProgress.done} / {g.nightProgress.total} locked in</p>}
            {g.votingProgress && <p className="mt-2 shrink-0 text-[clamp(1rem,2.8vh,1.25rem)] text-mute">{g.votingProgress.done} / {g.votingProgress.total} votes in</p>}
            <FitBox>{(box) => <PhotoWall players={view.players} settings={view.settings} box={box} winners={g.phase === 'game_over' ? (g.winner?.winnerIds ?? []) : null} replayFinale={finaleReplay} />}</FitBox>
            {g.phase === 'game_over' && g.winner && g.winner.faction !== 'none' && g.winner.faction !== 'draw' && (
              <Confetti palette={view.settings.bollywood ? 'party' : g.winner.faction} count={110} delay={finaleReplay ? finale(view.players, view.settings).end : 0} />
            )}
          </div>
          {g.phase !== 'game_over' && (
            <div className="card max-h-full min-h-0 self-start overflow-hidden p-5">
              <h3 className="eyebrow mb-3">Announcements</h3>
              <Feed entries={view.feed} limit={14} inGame />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** The big-screen wall of faces. Eliminated players' photos are cut in two. */
function PhotoWall({ players, lobby = false, settings, winners = null, box, replayFinale = true }: { players: PublicPlayer[]; lobby?: boolean; settings: Parameters<typeof roleAlignment>[1]; winners?: string[] | null; box: Box | null; replayFinale?: boolean }) {
  const n = players.length;
  const { size, cols } = fitFaces(n, box);
  if (!n) return <p className="mt-6 text-xl text-mute">Waiting for the first guest…</p>;
  if (winners) return <RevealWall players={players} settings={settings} winners={winners} box={box} replay={replayFinale} />;
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
 * Game over on the TV, in suspense: "And the Mafia were…", then the Mafia side turns over one by
 * one, then the special characters, then the villagers (see lib/finale). Every card is the
 * player's photo and name; the character's name sits under it, big. Winners keep a gold glow.
 * A TV that joins after the game ended shows everything at once (no replay).
 */
function RevealWall({ players, settings, winners, box, replay }: { players: PublicPlayer[]; settings: Parameters<typeof roleAlignment>[1]; winners: string[]; box: Box | null; replay: boolean }) {
  const fin = finale(players, settings);
  const { size, cols } = fitGrouped(fin.groups.map((g) => ({ count: g.players.length, title: g.title })), box, !!settings.bollywood);
  const colsFor = (n: number) => Math.max(1, Math.min(n, cols ?? n));
  const at = (t: number) => `${replay ? t : 0}s`;
  return (
    <div className="rv" data-testid="tv-reveal">
      {replay && (
        <p className="rv-suspense" style={{ ['--d' as string]: `${fin.suspenseAt}s` }} aria-hidden="true">
          And the Mafia were…
        </p>
      )}
      {fin.groups.map((grp) => (
        <section key={grp.key} className={`rv-group rv-${grp.key}`} aria-label={grp.title}>
          <h3 className="rv-head" style={{ ['--d' as string]: at(grp.start) }}>
            {grp.title} <span>{grp.players.length}</span>
          </h3>
          <ul className="rv-cards" style={{ gridTemplateColumns: `repeat(${colsFor(grp.players.length)}, ${size + PAD}px)` }}>
            {grp.players.map((p) => {
              const a = p.revealedRoleId ? roleAlignment(p.revealedRoleId, settings) : null;
              const won = winners.includes(p.id);
              const d = at(fin.cardAt.get(p.id) ?? 0);
              return (
                <li key={p.id} className="rv-item" data-player={p.name} data-dead={!p.alive}>
                  <div className={`tv-flip rv-card ${won ? 'is-winner' : ''}`} style={{ width: size, height: size, ['--d' as string]: d }}>
                    <div className="tv-flip-inner">
                      <div className="tv-flip-face rv-face">
                        <RvPhoto p={p} size={size} />
                        <span className="rv-q" aria-hidden="true">?</span>
                      </div>
                      <div className={`tv-flip-face tv-flip-back rv-face is-${a ?? 'none'}`}>
                        <RvPhoto p={p} size={size} />
                        <span className="rv-badge" aria-hidden="true">
                          <RoleArt art={roleArt(p.revealedRoleId, settings)} alignment={a} size={Math.max(26, Math.round(size * 0.3))} />
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="tv-flip-label rv-role" style={{ ['--d' as string]: d, fontSize: roleFont(size) }}>
                    <span className={ALIGN_TEXT[a ?? ''] ?? 'text-bone'}>
                      {won && '🏆 '}
                      {roleShort(p.revealedRoleId, settings)}
                    </span>
                    {settings.bollywood && p.revealedRoleId && <small> ({ROLES[p.revealedRoleId].name})</small>}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

/** A reveal card's face: the photo (or initials), the name across the bottom, a slash if they died. */
function RvPhoto({ p, size }: { p: PublicPlayer; size: number }) {
  return (
    <>
      <Avatar name={p.name} photo={p.photo} dead={!p.alive} size={size} />
      <span className="rv-name" style={{ fontSize: Math.max(12, Math.round(size * 0.13)) }}>
        {p.name}
      </span>
    </>
  );
}

const roleFont = (size: number) => Math.round(Math.max(15, Math.min(34, size * 0.19)));
const RV_HEAD = 40;

/**
 * The biggest card that fits every group into the box. Groups sit side by side and wrap to a
 * new line when they run out of width (Mafia | Special | Villagers on a wide TV).
 */
function fitGrouped(groups: { count: number; title: string }[], box: Box | null, bollywood: boolean): { size: number; cols: number | null } {
  // The character name can take two lines, plus the classic name in brackets in a Bollywood game.
  const label = (size: number) => Math.ceil(roleFont(size) * 1.15 * 2 + (bollywood ? roleFont(size) * 0.55 * 1.3 : 0)) + 10;
  const GROUP_GAP = 40;
  if (!box) return { size: 110, cols: null };
  const list = groups.filter((g) => g.count > 0);
  // The heading ("SPECIAL CHARACTERS 2") can be wider than its cards.
  const headW = (title: string) => title.length * 17 + 60;
  for (let size = 200; size >= 34; size -= 2) {
    const cell = size + PAD + GAP_X;
    const maxCols = Math.max(1, Math.floor((box.w + GAP_X) / cell));
    let lineW = 0;
    let lineH = 0;
    let total = 0;
    for (const { count: c, title } of list) {
      const cols = Math.min(c, maxCols);
      const w = Math.max(cols * cell - GAP_X, headW(title));
      const h = RV_HEAD + Math.ceil(c / cols) * (size + label(size) + GAP_Y);
      if (lineW > 0 && lineW + GROUP_GAP + w > box.w - 4) {
        total += lineH;
        lineW = 0;
        lineH = 0;
      }
      lineW += (lineW ? GROUP_GAP : 0) + w;
      lineH = Math.max(lineH, h);
    }
    total += lineH;
    if (total + 56 <= box.h) return { size, cols: maxCols }; // + room for line-height and margins
  }
  return { size: 34, cols: Math.max(1, Math.floor((box.w + GAP_X) / (34 + PAD + GAP_X))) };
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

/**
 * The game-over finale clock: `replay` when this screen saw the game end (so the suspense plays),
 * `done` once the last card has turned (then the winner is announced).
 */
function useFinale(view: ReturnType<typeof useRoom>['view']): { done: boolean; replay: boolean } {
  const g = view?.game ?? null;
  const over = g?.phase === 'game_over';
  // Decided during render (not in an effect) so the very first frame of the finale already
  // has the right timings — a CSS animation can't be restarted by changing its delay later.
  const prevPhase = useRef<string | null>(null);
  const replayRef = useRef(false);
  if (over && prevPhase.current !== 'game_over') replayRef.current = prevPhase.current !== null;
  prevPhase.current = g?.phase ?? null;
  const replay = over && replayRef.current;
  const [doneKey, setDoneKey] = useState<number | null>(null);
  const key = g?.phaseSeq ?? -1;
  useEffect(() => {
    if (!over || !view || !replay) return;
    const t = setTimeout(() => setDoneKey(key), finale(view.players, view.settings).end * 1000);
    return () => clearTimeout(t);
  }, [over, key]);
  if (!over) return { done: true, replay: false };
  return { done: !replay || doneKey === key, replay };
}
