import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MOVIE_COUNTS } from '../../../shared/charades/counts';
import { wordCount } from '../../../shared/charades/movie';
import { ROUND_OPTIONS, SWAP_OPTIONS, TIMER_OPTIONS, type CCommand, type CSettings, type CView, type TeamIdx } from '../../../shared/charades/types';
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
        {view.status === 'over' ? <HostOver view={view} send={send} /> : <HostTurn view={view} send={send} left={left} />}
      </div>
      <aside className="space-y-5">
        <HostTools view={view} send={send} />
        <History view={view} />
      </aside>
    </div>
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
          <a className="btn btn-ghost !min-h-10 shrink-0 whitespace-nowrap text-sm" href={`/ctv/${view.code}`} target="_blank" rel="noreferrer">
            📺 Open TV
          </a>
        </div>
        <p className="text-sm text-white/75">
          Each team sends one captain. They scan their team’s QR, or open <b>Join as captain</b> and type <b className="font-mono tracking-[0.2em] text-[#ffd76a]">{view.code}</b>.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {view.teams.map((t, i) => (
            <TeamInvite key={i} view={view} team={i as TeamIdx} url={`${origin}/charades/join/${view.code}?team=${i + 1}`} send={send} />
          ))}
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="charades-title text-3xl">House rules</h2>
        <Choice label="Rounds (each team acts once per round)" value={s.rounds} options={ROUND_OPTIONS.map((r) => [r, `${r} rounds`])} onChange={(v) => set({ rounds: Number(v) })} disabled={busy} />
        <Choice label="Time per turn" value={s.turnSeconds} options={TIMER_OPTIONS.map((t) => [t, fmtClock(t)])} onChange={(v) => set({ turnSeconds: Number(v) })} disabled={busy} />
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
        <Choice label="Card swaps per turn (clock keeps running)" value={s.swaps} options={SWAP_OPTIONS.map((n) => [n, n === 0 ? 'No swaps' : `${n} swap${n > 1 ? 's' : ''}`])} onChange={(v) => set({ swaps: Number(v) })} disabled={busy} />
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
          </span>
          <button
            className="text-xs text-white/70 underline"
            onClick={async () => (await confirm({ title: 'Free this seat?', body: `${t.captain!.name} will be signed out so someone else can be ${t.name}’s captain.`, confirm: 'Free the seat', danger: true })) && act({ type: 'kick_captain', team })}
          >
            Free seat
          </button>
        </div>
      ) : (
        <div className="grid place-items-center gap-1.5 py-1">
          <QR text={url} size={132} />
          <span className="text-xs text-white/75">Scan to be {t.name}’s captain</span>
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
        <p className="text-lg">
          {rival.name} picked <b className="text-[#ffd76a]">“{t.pending?.title}”</b>
        </p>
        <p className="text-sm text-white/70">{t.pending?.reason} Is it a real Hindi film from 2000 or later?</p>
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
          {t.card && <MovieCard card={t.card} />}
        </div>
        <p className="text-center text-sm text-white/70">Did {acting.name} shout the exact title?</p>
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
          {pickLabel(s)} · {s.swaps} swap{s.swaps === 1 ? '' : 's'} · {s.difficulty === 'easy' ? 'Easy' : s.difficulty === 'mixed' ? 'Mixed' : 'Film buff'}
        </li>
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
    const canSwap = t.card?.source === 'deck' && t.swapsLeft > 0;
    return (
      <div className="space-y-4">
        <TimerRing left={left ?? 0} total={view.settings.turnSeconds} paused={t.pausedLeft !== null} />
        {t.card && <MovieCard card={t.card} />}
        <p className="text-center text-xs text-white/70">🤫 Show this to your actor only. The host judges the guess.</p>
        <div className="grid grid-cols-2 gap-3">
          <button className="btn btn-marigold" disabled={busy || !canSwap} onClick={() => act({ type: 'swap', seq })}>
            🔀 Swap ({t.swapsLeft})
          </button>
          <button
            className="btn btn-ghost"
            disabled={busy}
            onClick={async () => (await confirm({ title: 'Give up this movie?', body: 'Your team gets no point for this turn.', confirm: 'Pass', danger: true })) && act({ type: 'give_up', seq })}
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
