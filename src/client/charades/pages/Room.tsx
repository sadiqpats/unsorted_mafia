import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MOVIE_COUNTS } from '../../../shared/charades/counts';
import { wordCount } from '../../../shared/charades/movie';
import { ROUND_OPTIONS, SWAP_OPTIONS, TIMER_OPTIONS, type CardView, type CCommand, type CSettings, type CView, type TeamIdx } from '../../../shared/charades/types';
import { OfflineBanner, QR, useConfirm, useToast } from '../../components/ui';
import { api } from '../../lib/api';
import { clearCSession, fmtClock, loadCSession, RESULT_LINE, useCharades, useTurnClock, type CAck } from '../lib';
import { BollyShell, CardBack, MovieCard, Petals, Scoreboard, TimerRing, useCharadesFx } from '../ui';

type Send = (c: CCommand) => Promise<CAck>;

/** Sends a command and shows its error (if any) as a toast. */
function useAct(send: Send) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const act = async (c: CCommand) => {
    setBusy(true);
    const r = await send(c);
    setBusy(false);
    if (!r.ok && r.error) toast(r.error.message);
    return r;
  };
  return { act, busy };
}

export default function CharadesRoom() {
  const code = (useParams().code ?? '').toUpperCase();
  const session = useMemo(() => loadCSession(code), [code]);
  const { view, status, endedReason, send, serverNow } = useCharades(code, session ? { token: session.token } : null);

  if (!session || status === 'denied' || status === 'ended') {
    return (
      <BollyShell>
        <div className="card mx-auto max-w-md p-6 text-center">
          <h1 className="charades-title text-3xl">{session ? 'You’re out of this room' : 'Not part of this room'}</h1>
          <p className="mt-2 text-sm text-white/75">{endedReason ?? 'This phone hasn’t joined this room yet.'}</p>
          <div className="mt-5 flex flex-col gap-2">
            <Link className="btn btn-bolly" to={`/charades/join/${code}`} onClick={() => clearCSession(code)}>
              Join as captain
            </Link>
            <Link className="btn btn-ghost" to="/charades">
              Dumb Charades home
            </Link>
          </div>
        </div>
      </BollyShell>
    );
  }
  if (!view) {
    return (
      <BollyShell>
        <div className="grid min-h-[50vh] place-items-center text-white/70">Rolling the film…</div>
      </BollyShell>
    );
  }
  return (
    <BollyShell wide={view.me.kind === 'host'} right={<span className="chip font-mono tracking-[0.3em]">{view.code}</span>}>
      <OfflineBanner status={status} />
      {view.me.kind === 'host' ? <HostPanel view={view} send={send} serverNow={serverNow} /> : <CaptainPanel view={view} send={send} serverNow={serverNow} />}
    </BollyShell>
  );
}

// ======================================================================= shared bits

function RoundLine({ view }: { view: CView }) {
  const t = view.turn;
  if (!t || view.status !== 'playing') return null;
  return (
    <p className="text-center text-sm font-semibold uppercase tracking-[0.25em] text-[#ffd98a]" data-testid="round-line">
      Round {t.round} of {view.settings.rounds} · {view.teams[t.team].name} acting
    </p>
  );
}

function ResultBanner({ view }: { view: CView }) {
  const t = view.turn!;
  const line = RESULT_LINE[t.result ?? 'pass'];
  return (
    <div className={`result-burst ${t.result === 'correct' ? 'result-correct' : 'result-miss'}`} data-testid="result" role="status">
      {t.result === 'correct' && <Petals />}
      <div className="result-big">{line.big}</div>
      <p className="mt-1 text-sm text-white/80">
        {view.teams[t.team].name}: {line.sub}
        {t.result === 'correct' && t.tookMs !== null && ` in ${Math.max(1, Math.round(t.tookMs / 1000))}s`}
      </p>
    </div>
  );
}

function Winner({ view }: { view: CView }) {
  const w = view.winner;
  return (
    <div className="card relative overflow-hidden p-6 text-center" data-testid="winner">
      <Petals count={48} />
      <div className="text-6xl" aria-hidden="true">
        🏆
      </div>
      <h2 className="charades-title mt-2 text-5xl">{w === 'tie' ? 'It’s a tie!' : `${view.teams[w as number].name} wins!`}</h2>
      <p className="mt-2 text-white/80">
        {view.teams[0].name} {view.teams[0].score} — {view.teams[1].score} {view.teams[1].name}
      </p>
    </div>
  );
}

function History({ view }: { view: CView }) {
  if (!view.history.length) return null;
  return (
    <section className="card p-4">
      <h3 className="eyebrow mb-2">Movies played</h3>
      <ol className="space-y-1.5 text-sm">
        {[...view.history].reverse().map((h) => (
          <li key={h.n} className="history-row flex items-center justify-between gap-3 rounded-lg bg-black/20 px-3 py-2">
            <span className="min-w-0">
              <span className="mr-2" aria-hidden="true">
                {h.result === 'correct' ? '✅' : h.result === 'timeout' ? '⏰' : '❌'}
              </span>
              <b className="text-white">{h.title}</b>
              {h.year ? <span className="ml-1 text-white/60">({h.year})</span> : null}
            </span>
            <span className="shrink-0 text-xs text-white/60">
              R{h.round} · {view.teams[h.team].name}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

// ======================================================================= host

function HostPanel({ view, send, serverNow }: { view: CView; send: Send; serverNow: () => number }) {
  const left = useTurnClock(view, serverNow);
  useCharadesFx(view, left, true);
  if (view.status === 'lobby') return <HostLobby view={view} send={send} />;
  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
      <div className="space-y-5">
        <Scoreboard view={view} />
        <RoundLine view={view} />
        {view.status === 'over' ? <HostOver view={view} send={send} /> : <HostMain view={view} send={send} left={left} />}
      </div>
      <aside className="space-y-5">
        <HostTools view={view} send={send} />
        <History view={view} />
      </aside>
    </div>
  );
}

/**
 * What the host's phone shows mid-game. A host who also captains a team gets that
 * team's captain controls on their own turn (and never sees their movie early),
 * the movie picker when the rival team picks, and the normal judge controls otherwise.
 */
function HostMain({ view, send, left }: { view: CView; send: Send; left: number | null }) {
  const me = view.me as Extract<CView['me'], { kind: 'host' }>;
  const t = view.turn;
  const team = me.captainTeam;
  if (team === null || !t) return <HostTurn view={view} send={send} left={left} />;
  // Seen as a captain: they confirm their own team's guess (there's no separate judge for them).
  const asCaptain = { ...view, settings: { ...view.settings, hostSeesMovie: false }, me: { kind: 'captain', team, name: view.hostName, rivalNote: me.rivalNote } } as CView;
  const badge = (
    <p className="text-center">
      <span className={`chip team-chip-${team}`}>
        👑 Host + captain · <b>{view.teams[team].name}</b>
      </span>
    </p>
  );
  if (t.team === team && t.stage !== 'approval' && t.stage !== 'done') {
    return (
      <div className="space-y-4">
        {badge}
        <MyTurn view={asCaptain} send={send} left={left} />
        {t.stage === 'acting' && <HostPause view={view} send={send} />}
      </div>
    );
  }
  if (t.team !== team && t.stage === 'picking' && view.settings.picker === 'rival') {
    return (
      <div className="space-y-4">
        {badge}
        <RivalPicker view={asCaptain} send={send} note={me.rivalNote} />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {badge}
      <HostTurn view={view} send={send} left={left} />
    </div>
  );
}

function HostPause({ view, send }: { view: CView; send: Send }) {
  const { act, busy } = useAct(send);
  const paused = view.turn?.pausedLeft !== null;
  return (
    <button className="btn btn-ghost w-full" disabled={busy} onClick={() => act({ type: paused ? 'resume' : 'pause', seq: view.seq })}>
      {paused ? '▶ Resume the clock' : '⏸ Pause the clock'}
    </button>
  );
}

const pickLabel = (s: CSettings) => (s.picker === 'deck' ? 'From the deck' : 'Rival team picks');

function HostLobby({ view, send }: { view: CView; send: Send }) {
  const { act, busy } = useAct(send);
  const s = view.settings;
  const set = (patch: Partial<CSettings>) => act({ type: 'update_settings', patch });
  const origin = typeof location !== 'undefined' ? location.origin : '';
  const ready = view.teams.every((t) => t.captain);
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <section className="card space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <h2 className="charades-title text-3xl">Invite the captains</h2>
        </div>
        <p className="text-sm text-white/75">
          Each team sends one captain. They scan their team’s QR, or open <b>Join as captain</b> and type <b className="font-mono tracking-[0.2em] text-[#ffd76a]">{view.code}</b>.
        </p>
        <TvLink code={view.code} />
        <div className="grid gap-4 sm:grid-cols-2">
          {view.teams.map((t, i) => (
            <TeamInvite key={i} view={view} team={i as TeamIdx} url={`${origin}/charades/join/${view.code}?team=${i + 1}`} send={send} />
          ))}
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="charades-title text-3xl">House rules</h2>
        <Choice label="Rounds (each team acts once per round)" value={s.rounds} options={withCurrent(ROUND_OPTIONS, s.rounds).map((r) => [r, `${r} rounds`])} onChange={(v) => set({ rounds: Number(v) })} disabled={busy} />
        <Choice label="Time per turn" value={s.turnSeconds} options={withCurrent(TIMER_OPTIONS, s.turnSeconds).map((t) => [t, fmtClock(t)])} onChange={(v) => set({ turnSeconds: Number(v) })} disabled={busy} />
        <Choice
          label="Who picks the movie?"
          value={s.picker}
          options={[
            ['deck', '🃏 Random card from the deck'],
            ['rival', '⚔️ The rival captain picks (types any movie)'],
          ]}
          onChange={(v) => set({ picker: v as CSettings['picker'] })}
          disabled={busy}
        />
        <Choice
          label="Card difficulty"
          value={s.difficulty}
          options={[
            ['easy', `😄 Easy — blockbusters only (${MOVIE_COUNTS.easy})`],
            ['mixed', `🎯 Mixed — famous films (${MOVIE_COUNTS.mixed})`],
            ['all', `🎓 Film buff — everything (${MOVIE_COUNTS.all})`],
          ]}
          onChange={(v) => set({ difficulty: v as CSettings['difficulty'] })}
          disabled={busy}
        />
        <label className="flex items-center justify-between gap-3 rounded-xl border border-[#ffb300]/20 bg-black/20 p-3 text-sm">
          <span>
            I’m playing too
            <span className="block text-xs text-white/60">Hides the movie on your screen. The acting captain taps ✅ when their team gets it.</span>
          </span>
          <input type="checkbox" className="h-5 w-5 accent-[#ff3d8b]" aria-label="I’m playing too" checked={!s.hostSeesMovie} onChange={(e) => set({ hostSeesMovie: !e.target.checked })} />
        </label>
        <Choice label="New cards per turn (flip back to any of them; the clock keeps running)" value={s.swaps} options={withCurrent(SWAP_OPTIONS, s.swaps).map((n) => [n, n === 0 ? 'Just one card' : `Up to ${n} more`])} onChange={(v) => set({ swaps: Number(v) })} disabled={busy} />
        <Choice
          label="Who goes first?"
          value={s.firstTeam}
          options={[
            ['random', '🎲 Toss a coin'],
            ['0', view.teams[0].name],
            ['1', view.teams[1].name],
          ]}
          onChange={(v) => set({ firstTeam: v as CSettings['firstTeam'] })}
          disabled={busy}
        />
        <label className="flex items-center justify-between gap-3 rounded-xl border border-[#ffb300]/20 bg-black/20 p-3 text-sm">
          <span>
            Show word blanks on the TV
            <span className="block text-xs text-white/60">“_ _ _” for a three-word title while acting.</span>
          </span>
          <input type="checkbox" className="h-5 w-5 accent-[#ff3d8b]" checked={s.showWordCount} onChange={(e) => set({ showWordCount: e.target.checked })} />
        </label>
        <button className="btn btn-bolly w-full text-lg" disabled={busy || !ready} onClick={() => act({ type: 'start' })}>
          {ready ? '🎬 Start the show' : 'Waiting for both captains…'}
        </button>
      </section>
    </div>
  );
}

/** Keep a value the host set some other way (e.g. "+ Add a round") selectable in its dropdown. */
const withCurrent = (opts: readonly number[], v: number) => [...new Set([...opts, v])].sort((a, b) => a - b);

/** The TV gets its own link: open it on the TV's browser (or a laptop plugged into it). Your host screen stays private. */
function TvLink({ code }: { code: string }) {
  const toast = useToast();
  const url = `${typeof location !== 'undefined' ? location.origin : ''}/ctv/${code}`;
  return (
    <div className="flex items-center gap-4 rounded-xl border border-[#ffb300]/30 bg-black/25 p-3" data-testid="tv-link">
      <QR text={url} size={88} />
      <div className="min-w-0 flex-1 space-y-2">
        <p className="text-sm font-semibold">📺 TV screen link</p>
        <p className="truncate font-mono text-xs text-[#ffd76a]">{url.replace(/^https?:\/\//, '')}</p>
        <div className="flex gap-2">
          <a className="btn btn-marigold !min-h-9 !px-3 !py-1 text-xs" href={url} target="_blank" rel="noreferrer">
            Open TV
          </a>
          <button
            className="btn btn-ghost !min-h-9 !px-3 !py-1 text-xs"
            onClick={() =>
              navigator.clipboard?.writeText(url).then(
                () => toast('TV link copied'),
                () => toast(url),
              )
            }
          >
            Copy link
          </button>
        </div>
      </div>
    </div>
  );
}

function Choice({ label, value, options, onChange, disabled }: { label: string; value: string | number; options: (readonly [string | number, string])[]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      <select className="field" value={String(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map(([v, l]) => (
          <option key={String(v)} value={String(v)}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function TeamInvite({ view, team, url, send }: { view: CView; team: TeamIdx; url: string; send: Send }) {
  const { act } = useAct(send);
  const confirm = useConfirm();
  const t = view.teams[team];
  const hostTeam = view.me.kind === 'host' ? view.me.captainTeam : null;
  const mine = hostTeam === team;
  const hostFree = view.me.kind === 'host' && hostTeam === null;
  const [name, setName] = useState(t.name);
  useEffect(() => setName(t.name), [t.name]);
  const save = (e?: FormEvent) => {
    e?.preventDefault();
    if (name.trim() && name.trim() !== t.name) void act({ type: 'rename_team', team, name: name.trim() });
  };
  return (
    <div className={`score-tile team-${team} space-y-2 text-left`}>
      <form onSubmit={save}>
        <label className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-white/70" htmlFor={`team-name-${team}`}>
          Team name
        </label>
        <input id={`team-name-${team}`} className="field !min-h-10 !py-1.5" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} onBlur={() => save()} />
      </form>
      {t.captain ? (
        <div className="flex items-center justify-between gap-2 text-sm" data-testid={`captain-${team}`}>
          <span>
            <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${t.captain.online ? 'bg-[#6fe39b]' : 'bg-white/30'}`} aria-hidden="true" />
            Captain <b>{t.captain.name}</b>
            {mine && ' (you, on this phone)'}
          </span>
          <button
            className="text-xs text-white/70 underline"
            onClick={async () =>
              mine
                ? act({ type: 'kick_captain', team })
                : (await confirm({ title: 'Free this seat?', body: `${t.captain!.name} will be signed out so someone else can be ${t.name}’s captain.`, confirm: 'Free the seat', danger: true })) && act({ type: 'kick_captain', team })
            }
          >
            Free seat
          </button>
        </div>
      ) : (
        <div className="grid place-items-center gap-1.5 py-1">
          <QR text={url} size={132} />
          <span className="text-xs text-white/75">Scan to be {t.name}’s captain</span>
          {hostFree && (
            <button className="btn btn-marigold mt-1 !min-h-10 w-full !py-1.5 text-sm" onClick={() => act({ type: 'claim_captain', team })}>
              🙋 I’ll captain {t.name} (on this phone)
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function HostTurn({ view, send, left }: { view: CView; send: Send; left: number | null }) {
  const { act, busy } = useAct(send);
  const t = view.turn!;
  const acting = view.teams[t.team];
  const rival = view.teams[1 - t.team];
  const seq = view.seq;
  const last = t.n >= view.settings.rounds * 2;

  if (t.stage === 'picking') {
    return (
      <Panel>
        {view.settings.picker === 'deck' ? (
          <>
            <BigEmoji>🃏</BigEmoji>
            <p className="text-lg">
              Waiting for <b>{acting.captain?.name ?? acting.name}</b> to flip the card.
            </p>
            <p className="text-sm text-white/70">The clock starts the moment they reveal it.</p>
            <FlipHere seq={seq} send={send} />
          </>
        ) : (
          <>
            <BigEmoji>{t.checking ? '🔎' : '⚔️'}</BigEmoji>
            <p className="text-lg">{t.checking ? `Checking ${rival.name}’s movie online…` : `${rival.captain?.name ?? rival.name} is choosing a movie for ${acting.name}.`}</p>
            <button className="btn btn-ghost" disabled={busy || t.checking} onClick={() => act({ type: 'random_card', seq })}>
              🎲 Deal a random card instead
            </button>
          </>
        )}
      </Panel>
    );
  }
  if (t.stage === 'approval') {
    return (
      <Panel>
        <BigEmoji>🤔</BigEmoji>
        {t.pending?.title ? (
          <>
            <p className="text-lg">
              {rival.name} picked <b className="text-[#ffd76a]">“{t.pending.title}”</b>
            </p>
            <p className="text-sm text-white/70">{t.pending.reason} Is it a real Hindi film from 2000 or later?</p>
          </>
        ) : (
          <>
            <p className="text-lg">{rival.name} typed a movie we couldn’t check online.</p>
            <p className="text-sm text-white/70">The title stays hidden because you’re playing. Allow it if you trust {rival.captain?.name ?? 'their captain'} to pick a real Hindi film from 2000 or later.</p>
          </>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button className="btn btn-ok" disabled={busy} onClick={() => act({ type: 'approve', seq, ok: true })}>
            ✅ Allow it
          </button>
          <button className="btn btn-no" disabled={busy} onClick={() => act({ type: 'approve', seq, ok: false })}>
            ❌ Refuse
          </button>
        </div>
      </Panel>
    );
  }
  if (t.stage === 'ready') {
    return (
      <div className="space-y-4">
        <Panel>
          <p className="text-lg">
            Movie chosen. Waiting for <b>{acting.captain?.name ?? acting.name}</b> to flip it.
          </p>
          <FlipHere seq={seq} send={send} />
        </Panel>
        {t.card && <MovieCard card={t.card} />}
      </div>
    );
  }
  if (t.stage === 'acting') {
    const paused = t.pausedLeft !== null;
    return (
      <div className="space-y-4">
        <div className="grid items-center gap-4 sm:grid-cols-[auto_1fr]">
          <TimerRing left={left ?? 0} total={view.settings.turnSeconds} paused={paused} />
          {t.card ? (
            <MovieCard card={t.card} />
          ) : (
            <div className="card p-5 text-center" data-testid="movie-hidden">
              <div className="text-4xl" aria-hidden="true">
                🙈
              </div>
              <p className="mt-2 font-semibold">Movie hidden — you’re playing too.</p>
              <p className="mt-1 text-sm text-white/70">
                {acting.captain?.name ?? 'The captain'} can see it{t.cardCount > 1 ? ` (card ${t.current + 1} of ${t.cardCount})` : ''} and taps ✅ when the team gets it.
              </p>
            </div>
          )}
        </div>
        <p className="text-center text-sm text-white/70">{t.card ? `Did ${acting.name} shout the exact title?` : 'Or judge it yourself when the captain nods:'}</p>
        <div className="grid grid-cols-2 gap-3">
          <button className="btn btn-ok min-h-16 text-xl" disabled={busy} onClick={() => act({ type: 'judge', seq, result: 'correct' })}>
            ✅ Guessed it!
          </button>
          <button className="btn btn-no min-h-16 text-xl" disabled={busy} onClick={() => act({ type: 'judge', seq, result: 'pass' })}>
            ❌ Pass
          </button>
        </div>
        <button className="btn btn-ghost w-full" disabled={busy} onClick={() => act({ type: paused ? 'resume' : 'pause', seq })}>
          {paused ? '▶ Resume the clock' : '⏸ Pause the clock'}
        </button>
      </div>
    );
  }
  // done
  return (
    <div className="space-y-4">
      <ResultBanner view={view} />
      {t.card && <MovieCard card={t.card} />}
      <button className="btn btn-bolly w-full text-lg" disabled={busy} onClick={() => act({ type: 'next_turn', seq })}>
        {last ? '🏆 Reveal the winner' : `Next: ${rival.name} ▶`}
      </button>
      <button className="btn btn-ghost w-full text-sm" disabled={busy} onClick={() => act({ type: 'fix_result', seq })}>
        Oops — mark as {t.result === 'correct' ? 'missed' : 'guessed (+1)'}
      </button>
    </div>
  );
}

/** Backup when the acting captain's phone is gone: the host reveals the card and shows the actor. */
function FlipHere({ seq, send }: { seq: number; send: Send }) {
  const { act, busy } = useAct(send);
  const confirm = useConfirm();
  return (
    <button
      className="text-xs text-white/60 underline underline-offset-4"
      disabled={busy}
      onClick={async () =>
        (await confirm({ title: 'Flip the card on your screen?', body: 'Use this if the captain’s phone died. You’ll see the movie — show it to the actor only. The clock starts now.', confirm: 'Flip it here' })) &&
        act({ type: 'reveal_here', seq })
      }
    >
      Captain’s phone died? Flip it here
    </button>
  );
}

function HostOver({ view, send }: { view: CView; send: Send }) {
  const { act, busy } = useAct(send);
  return (
    <div className="space-y-4">
      <Winner view={view} />
      <div className="grid gap-3 sm:grid-cols-2">
        <button className="btn btn-bolly" disabled={busy} onClick={() => act({ type: 'one_more_round' })}>
          {view.winner === 'tie' ? '⚔️ Tie-breaker round' : '➕ One more round'}
        </button>
        <button className="btn btn-marigold" disabled={busy} onClick={() => act({ type: 'play_again' })}>
          🔁 New game (same captains)
        </button>
      </div>
    </div>
  );
}

function HostTools({ view, send }: { view: CView; send: Send }) {
  const { act, busy } = useAct(send);
  const confirm = useConfirm();
  const s = view.settings;
  return (
    <section className="card space-y-3 p-4 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="eyebrow">This game</h3>
        <a className="btn btn-ghost !min-h-9 !py-1 text-xs" href={`/ctv/${view.code}`} target="_blank" rel="noreferrer">
          📺 TV
        </a>
      </div>
      <ul className="space-y-1 text-white/80">
        <li>
          {s.rounds} rounds · {fmtClock(s.turnSeconds)} per turn
        </li>
        <li>
          {pickLabel(s)} · {s.swaps} new card{s.swaps === 1 ? '' : 's'} per turn · {s.difficulty === 'easy' ? 'Easy' : s.difficulty === 'mixed' ? 'Mixed' : 'Film buff'}
        </li>
        <li>{s.hostSeesMovie ? '👀 Movie shown on your screen' : '🙈 You’re playing — movie hidden on your screen'}
        </li>
      </ul>
      <ul className="space-y-1.5" aria-label="Captains">
        {view.teams.map((tm, i) => (
          <li key={i} className="flex items-center justify-between gap-2 rounded-lg bg-black/20 px-3 py-2">
            <span className="min-w-0 truncate">
              <span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${tm.captain?.online ? 'bg-[#6fe39b]' : 'bg-white/30'}`} aria-hidden="true" />
              {tm.name}: {tm.captain ? <b>{tm.captain.name}</b> : <i className="text-white/60">seat free — scan to join</i>}
            </span>
            {tm.captain && (
              <button
                className="shrink-0 text-xs text-white/70 underline"
                onClick={async () =>
                  (await confirm({ title: `Free ${tm.name}’s captain seat?`, body: `${tm.captain!.name} is signed out. A new captain can join from the Join page with code ${view.code}.`, confirm: 'Free the seat', danger: true })) &&
                  act({ type: 'kick_captain', team: i as TeamIdx })
                }
              >
                Free seat
              </button>
            )}
          </li>
        ))}
      </ul>
      {view.status === 'playing' && (
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-ghost !min-h-10 text-xs" disabled={busy} onClick={() => act({ type: 'update_settings', patch: { rounds: s.rounds + 1 } })}>
            + Add a round
          </button>
          <button
            className="btn btn-ghost !min-h-10 text-xs"
            disabled={busy}
            onClick={async () => (await confirm({ title: 'End the game now?', body: 'Scores so far decide the winner.', confirm: 'End game', danger: true })) && act({ type: 'end_game' })}
          >
            🏁 End game
          </button>
        </div>
      )}
    </section>
  );
}

const Panel = ({ children }: { children: ReactNode }) => <div className="card anim-fade-up space-y-3 p-6 text-center">{children}</div>;
const BigEmoji = ({ children }: { children: ReactNode }) => (
  <div className="anim-drift text-6xl" aria-hidden="true">
    {children}
  </div>
);

// ======================================================================= captain

function CaptainPanel({ view, send, serverNow }: { view: CView; send: Send; serverNow: () => number }) {
  const left = useTurnClock(view, serverNow);
  const me = view.me as Extract<CView['me'], { kind: 'captain' }>;
  const t = view.turn;
  const mine = t?.team === me.team;
  useCharadesFx(view, left, !!mine);
  const myTeam = view.teams[me.team];
  return (
    <div className="mx-auto max-w-md space-y-5">
      <p className="text-center">
        <span className={`chip team-chip-${me.team}`}>
          👑 Captain · <b>{myTeam.name}</b>
        </span>
      </p>
      <Scoreboard view={view} />
      <RoundLine view={view} />
      {view.status === 'lobby' && (
        <Panel>
          <BigEmoji>🎬</BigEmoji>
          <p className="text-lg">You’re in, {me.name}!</p>
          <p className="text-sm text-white/75">Waiting for the host to start. When it’s your team’s turn, flip the card, show it <b>only</b> to your actor, and let the drama begin.</p>
        </Panel>
      )}
      {view.status === 'over' && (
        <>
          <Winner view={view} />
          <History view={view} />
        </>
      )}
      {view.status === 'playing' && t && (mine ? <MyTurn view={view} send={send} left={left} /> : <TheirTurn view={view} send={send} left={left} />)}
    </div>
  );
}

function MyTurn({ view, send, left }: { view: CView; send: Send; left: number | null }) {
  const { act, busy } = useAct(send);
  const confirm = useConfirm();
  const t = view.turn!;
  const rival = view.teams[1 - t.team];
  const seq = view.seq;
  if (t.stage === 'picking' || t.stage === 'approval') {
    if (view.settings.picker === 'deck') return <CardBack label="Tap to reveal — the clock starts!" disabled={busy} onClick={() => act({ type: 'reveal', seq })} />;
    return (
      <Panel>
        <BigEmoji>⚔️</BigEmoji>
        <p className="text-lg">{t.checking ? `Checking ${rival.name}’s pick…` : t.stage === 'approval' ? 'The host is checking their pick…' : `${rival.name} is choosing your movie…`}</p>
        <p className="text-sm text-white/70">Get your actor ready. You’ll flip the card when it arrives.</p>
      </Panel>
    );
  }
  if (t.stage === 'ready') return <CardBack label={`${rival.name} picked your movie. Tap to reveal — the clock starts!`} disabled={busy} onClick={() => act({ type: 'reveal', seq })} />;
  if (t.stage === 'acting') {
    const cards = t.cards ?? (t.card ? [t.card] : []);
    const canSwap = cards[0]?.source === 'deck' && t.swapsLeft > 0;
    const hostPlays = !view.settings.hostSeesMovie;
    return (
      <div className="space-y-4">
        <TimerRing left={left ?? 0} total={view.settings.turnSeconds} paused={t.pausedLeft !== null} />
        <CardBrowser cards={cards} current={t.current} onShow={(index) => void send({ type: 'show_card', index })} />
        <p className="text-center text-xs text-white/70">🤫 Show this to your actor only. The card on screen is the one being acted.</p>
        {hostPlays && (
          <button
            className="btn btn-ok min-h-14 w-full text-lg"
            disabled={busy}
            onClick={async () =>
              (await confirm({ title: 'Did your team get it?', body: 'They said the exact title on your card?', confirm: 'Yes — +1 point' })) && act({ type: 'got_it', seq })
            }
          >
            ✅ They got it!
          </button>
        )}
        <div className="grid grid-cols-2 gap-3">
          <button className="btn btn-marigold" disabled={busy || !canSwap} onClick={() => act({ type: 'swap', seq })}>
            🔀 New card ({t.swapsLeft})
          </button>
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={async () => (await confirm({ title: 'Give up this turn?', body: 'Your team gets no point for this turn.', confirm: 'Pass', danger: true })) && act({ type: 'give_up', seq })}
          >
            🏳️ Pass
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ResultBanner view={view} />
      {t.card && <MovieCard card={t.card} />}
      <p className="text-center text-sm text-white/70">Next up: {rival.name}. The host moves the game on.</p>
    </div>
  );
}

/**
 * The cards drawn this turn: arrows, dots and swipe to flip back and forth. The one
 * showing is the one being acted. Because the phone stays awake, the card hides
 * itself after 12 seconds untouched (and whenever the phone comes back from another
 * app), so a teammate glancing at the table can't read the answer. Tap to show it.
 */
function CardBrowser({ cards, current, onShow }: { cards: CardView[]; current: number; onShow: (i: number) => void }) {
  const startX = useRef<number | null>(null);
  const [hidden, setHidden] = useState(false);
  const [poke, setPoke] = useState(0);
  const touch = () => setPoke((n) => n + 1);
  useEffect(() => {
    if (hidden) return;
    // Tests may shorten/lengthen this via window.__CARD_HIDE_MS.
    const ms = (window as unknown as { __CARD_HIDE_MS?: number }).__CARD_HIDE_MS ?? 12_000;
    const t = setTimeout(() => setHidden(true), ms);
    return () => clearTimeout(t);
  }, [hidden, poke, current, cards.length]);
  useEffect(() => {
    const onVis = () => document.visibilityState === 'visible' && setHidden(true);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);
  const go = (i: number) => {
    touch();
    if (i >= 0 && i < cards.length && i !== current) onShow(i);
  };
  const card = cards[current] ?? cards[cards.length - 1];
  if (!card) return null;
  if (hidden) {
    return (
      <button type="button" className="card-cover focus-ring" data-testid="card-cover" onClick={() => (setHidden(false), touch())}>
        <span className="text-4xl" aria-hidden="true">
          🙈
        </span>
        <span className="mt-2 text-lg font-semibold">Movie hidden</span>
        <span className="mt-1 text-sm text-white/70">Tap to show it (only to your actor!)</span>
        {cards.length > 1 && <span className="mt-2 text-xs text-white/60">Card {current + 1} of {cards.length}</span>}
      </button>
    );
  }
  return (
    <div onPointerDown={touch}>
      <div
        onTouchStart={(e) => (startX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (startX.current === null) return;
          const dx = e.changedTouches[0].clientX - startX.current;
          startX.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? current + 1 : current - 1);
        }}
      >
        <MovieCard card={card} />
      </div>
      <div className="mt-3 flex items-center justify-between gap-2" data-testid="card-browser">
        <button className="btn btn-ghost !min-h-10 !px-4" aria-label="Previous card" disabled={current === 0} onClick={() => go(current - 1)}>
          ‹
        </button>
        <div className="flex flex-col items-center gap-1.5">
          {cards.length > 1 && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {cards.map((c, i) => (
                <button key={c.title + i} aria-label={`Card ${i + 1}`} aria-current={i === current} className={`card-dot ${i === current ? 'is-on' : ''}`} onClick={() => go(i)} />
              ))}
            </div>
          )}
          <span className="text-xs text-white/70">
            Card {current + 1} of {cards.length} ·{' '}
            <button className="underline underline-offset-2" onClick={() => setHidden(true)}>
              🙈 Hide
            </button>
          </span>
        </div>
        <button className="btn btn-ghost !min-h-10 !px-4" aria-label="Next card" disabled={current === cards.length - 1} onClick={() => go(current + 1)}>
          ›
        </button>
      </div>
    </div>
  );
}

function TheirTurn({ view, send, left }: { view: CView; send: Send; left: number | null }) {
  const t = view.turn!;
  const acting = view.teams[t.team];
  const me = view.me as Extract<CView['me'], { kind: 'captain' }>;
  if (t.stage === 'picking' && view.settings.picker === 'rival') return <RivalPicker view={view} send={send} note={me.rivalNote} />;
  if (t.stage === 'picking' || t.stage === 'approval' || t.stage === 'ready') {
    return (
      <div className="space-y-4">
        <Panel>
          <BigEmoji>🍿</BigEmoji>
          <p className="text-lg">{t.stage === 'approval' ? 'The host is checking your movie…' : `${acting.name} is up next.`}</p>
          <p className="text-sm text-white/70">{t.stage === 'ready' ? 'Your pick is in. Waiting for them to flip it.' : 'Sit back and enjoy the show.'}</p>
        </Panel>
        {t.card && <MovieCard card={t.card} />}
      </div>
    );
  }
  if (t.stage === 'acting') {
    return (
      <div className="space-y-4">
        <TimerRing left={left ?? 0} total={view.settings.turnSeconds} paused={t.pausedLeft !== null} />
        <p className="text-center text-lg">{acting.name} is acting!</p>
        {t.card && <MovieCard card={t.card} />}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <ResultBanner view={view} />
      {t.card && <MovieCard card={t.card} />}
    </div>
  );
}

/** Rival mode: type any Bollywood film (checked online) or send a random card. */
function RivalPicker({ view, send, note }: { view: CView; send: Send; note: string | null }) {
  const { act, busy } = useAct(send);
  const t = view.turn!;
  const acting = view.teams[t.team];
  const [title, setTitle] = useState('');
  const [hints, setHints] = useState<string[]>([]);
  useEffect(() => {
    if (title.trim().length < 2) return setHints([]);
    const id = setTimeout(() => {
      api<{ titles: string[] }>(`/api/charades/suggest?q=${encodeURIComponent(title.trim())}`).then(
        (r) => setHints(r.titles),
        () => setHints([]),
      );
    }, 180);
    return () => clearTimeout(id);
  }, [title]);
  const words = wordCount(title);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (title.trim()) void act({ type: 'choose_movie', seq: view.seq, title: title.trim() });
  };
  if (t.checking) {
    return (
      <Panel>
        <BigEmoji>🔎</BigEmoji>
        <p className="text-lg">Checking your movie online…</p>
        <p className="text-sm text-white/70">Real Hindi film, 2000 or later, four words max.</p>
      </Panel>
    );
  }
  return (
    <form onSubmit={submit} className="card anim-fade-up space-y-4 p-5" data-testid="rival-picker">
      <div className="text-center">
        <h2 className="charades-title text-3xl">Pick {acting.name}’s movie</h2>
        <p className="mt-1 text-sm text-white/70">Make it tough — but fair! Hindi film, 2000 or later, at most four words.</p>
      </div>
      <label className="block">
        <span className="sr-only">Movie title</span>
        <input className="field text-lg" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} placeholder="Type a movie…" autoComplete="off" list="movie-hints" />
        <datalist id="movie-hints">
          {hints.map((h) => (
            <option key={h} value={h} />
          ))}
        </datalist>
        <span className={`mt-1 block text-xs ${words > 4 ? 'text-[#ff8fa3]' : 'text-white/60'}`}>{words ? `${words} word${words > 1 ? 's' : ''}${words > 4 ? ' — too long!' : ''}` : ' '}</span>
      </label>
      {hints.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Suggestions">
          {hints.slice(0, 6).map((h) => (
            <li key={h}>
              <button type="button" className="chip !py-1" onClick={() => setTitle(h)}>
                {h}
              </button>
            </li>
          ))}
        </ul>
      )}
      {note && (
        <p className="rounded-xl border border-[#ff3d6b]/50 bg-[#ff3d6b]/10 p-3 text-sm" role="alert">
          {note}
        </p>
      )}
      <button className="btn btn-bolly w-full text-lg" disabled={busy || !title.trim() || words > 4}>
        Send this movie
      </button>
      <button type="button" className="btn btn-marigold w-full" disabled={busy} onClick={() => act({ type: 'choose_movie', seq: view.seq, random: true })}>
        🎲 Surprise them (random card)
      </button>
    </form>
  );
}
