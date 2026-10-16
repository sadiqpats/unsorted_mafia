import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { NightOption } from '../../shared/engine';
import type { Ack, CommandInput } from '../../shared/protocol';
import { ABILITIES, ROLES, roleAlignment } from '../../shared/roles';
import type { ClientView, PublicPlayer } from '../../shared/view-types';
import { Avatar } from '../components/Avatar';
import { HoldToReveal, PrivacyShield, RoleDetails } from '../components/RoleCard';
import { PhotoPicker } from '../components/PhotoPicker';
import { RoleArt } from '../components/RoleArt';
import { uploadPhoto } from '../lib/photo';
import { loadSession } from '../lib/session';
import { AlignmentBadge, Feed, Modal, PHASE_LABEL, PlayerRow, Section, Timer, useToast } from '../components/ui';

type Send = (c: CommandInput) => Promise<Ack>;

export interface GameProps {
  view: ClientView;
  send: Send;
  serverNow: () => number;
}

export function useAct(send: Send) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const act = async (cmd: CommandInput, okMsg?: string) => {
    setBusy(true);
    const a = await send(cmd);
    setBusy(false);
    if (!a.ok) toast(a.error?.message ?? 'That didn’t work.', 'error');
    else if (okMsg) toast(okMsg);
    return a;
  };
  return { act, busy };
}

const nameOf = (view: ClientView, id: string | null | undefined) => (id ? (view.players.find((p) => p.id === id)?.name ?? '—') : 'Nobody');

const ACTION_PHASES = ['prenight', 'night', 'voting'];

// ======================================================================= root

export function PlayerGame({ view, send, serverNow }: GameProps) {
  const me = view.me!;
  const g = view.game;
  if (view.status === 'lobby' || !g) return <PlayerLobby view={view} send={send} />;
  const phase = g.phase;
  return (
    <div className="space-y-4">
      <PhaseHeader view={view} serverNow={serverNow} />
      {me.alive || phase === 'game_over' ? null : <DeadBanner view={view} />}
      {me.silenced && me.alive && phase !== 'game_over' && (
        <div className="rounded-xl border border-gold/50 bg-gold/10 p-3 text-center text-sm" role="status">
          🤐 <b>You have been silenced.</b> Do not speak during today’s discussion. You cannot vote today.
        </div>
      )}
      {phase === 'reveal' && <RevealPanel view={view} send={send} />}
      {(phase === 'night' || phase === 'prenight') && <NightPanel key={phase} view={view} send={send} />}
      {phase === 'voting' && <DayPanel view={view} send={send} />}
      {phase === 'verdict' && <VerdictPanel view={view} />}
      {phase === 'game_over' && <GameOverPanel view={view} />}
      {/* Action phases show ONLY the action — no lists, feeds or extra buttons. */}
      {phase === 'voting' && <MyRoleButton view={view} />}
      {!ACTION_PHASES.includes(phase) && (
        <>
          {phase !== 'reveal' && phase !== 'game_over' && <MyRoleButton view={view} />}
          {phase !== 'game_over' && (
            <Section title="Town square">
              <PlayersList view={view} />
            </Section>
          )}
          <Section title="Announcements">
            <Feed entries={view.feed} limit={12} />
          </Section>
        </>
      )}
    </div>
  );
}

function PhaseHeader({ view, serverNow }: { view: ClientView; serverNow: () => number }) {
  const g = view.game!;
  const roundLabel = g.round > 0 && g.phase !== 'game_over' ? `Round ${g.round}` : '';
  return (
    <div className="card flex items-center justify-between gap-3 p-4">
      <div>
        <div className="eyebrow">{roundLabel || 'Mafia Night'}</div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-bone">{PHASE_LABEL[g.phase]}</h1>
      </div>
      <Timer endsAt={g.phaseEndsAt} serverNow={serverNow} pausedMs={g.pausedRemainingMs} />
    </div>
  );
}

function DeadBanner({ view }: { view: ClientView }) {
  const me = view.me!;
  return (
    <div className="rounded-xl border border-line bg-black/60 p-4 text-center" role="status">
      <div className="text-3xl" aria-hidden="true">
        ☠
      </div>
      <p className="mt-1 font-[family-name:var(--font-display)] text-lg">You have been eliminated</p>
      <p className="mt-1 text-sm text-mute">Stay silent — no hints, no faces. You can keep watching the game here.</p>
      {me.allRoles && <p className="mt-2 text-xs text-gold">House rule: the dead can see every role (below).</p>}
    </div>
  );
}

// ======================================================================= lobby

function PlayerLobby({ view, send }: { view: ClientView; send: Send }) {
  const me = view.me!;
  const { act, busy } = useAct(send);
  const counts = Object.entries(view.settings.roles).filter(([, c]) => c > 0);
  const d = view.distribution;
  return (
    <div className="space-y-4 anim-fade-up">
      <div className="card p-5 text-center">
        <p className="eyebrow">Room</p>
        <p className="mt-1 font-[family-name:var(--font-display)] text-4xl tracking-[0.3em] text-bone">{view.code}</p>
        <p className="mt-2 text-sm text-mute">
          Hosted by {view.hostName} · {view.players.length}/{view.settings.playerCount} players
        </p>
        <button
          className={`btn mt-5 w-full text-lg ${me.isHost ? 'btn-ghost' : view.players.find((p) => p.id === me.id)?.ready ? 'btn-ghost' : 'btn-primary'}`}
          disabled={busy || me.isHost}
          onClick={() => act({ type: 'ready', ready: !view.players.find((p) => p.id === me.id)?.ready })}
        >
          {view.players.find((p) => p.id === me.id)?.ready ? '✓ Ready — tap to undo' : 'I’m ready'}
        </button>
      </div>
      <LobbyPhoto view={view} />
      <Section title="While you wait">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-bone/90">
          <li>Keep this page open. If it closes, just reopen the same link — your seat is saved on this phone.</li>
          <li>When the game starts, find a private moment, then press and hold the card to see your role.</li>
          <li>At night everyone taps a choice — even if you have no power. Shield your screen.</li>
          <li>Never show your screen to anyone. Talking is the game; showing is cheating.</li>
        </ol>
        <Link to="/guide" className="mt-3 inline-block text-sm text-gold underline underline-offset-4">
          Full rules & characters
        </Link>
      </Section>
      <Section title={`Players (${view.players.length})`}>
        <PlayersList view={view} lobby />
      </Section>
      <Section title="Characters in this game">
        <div className="mb-3 flex flex-wrap gap-2 text-xs">
          <span className="chip text-good">⛨ Town {d.byAlignment.good}</span>
          <span className="chip text-ember">🗡 Mafia {d.byAlignment.mafia}</span>
          <span className="chip text-neutral">◆ Neutral {d.byAlignment.neutral}</span>
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {counts.map(([id, c]) => (
            <li key={id} className="flex items-center gap-2 rounded-lg border border-line/60 p-2 text-sm">
              <RoleArt art={ROLES[id].art} alignment={roleAlignment(id, view.settings)} size={32} />
              <span>
                {ROLES[id].name} {c > 1 && <span className="text-mute">×{c}</span>}
              </span>
            </li>
          ))}
        </ul>
      </Section>
    </div>
  );
}

function LobbyPhoto({ view }: { view: ClientView }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const me = view.players.find((p) => p.id === view.me!.id)!;
  const save = async (photo: string | null) => {
    const session = loadSession(view.code);
    if (!session) return;
    setBusy(true);
    try {
      await uploadPhoto(view.code, session.token, photo);
      toast(photo ? 'Photo saved.' : 'Photo removed.');
    } catch (e) {
      toast(e instanceof Error ? e.message : 'Photo upload failed.', 'error');
    }
    setBusy(false);
  };
  return (
    <section className="card p-4">
      <PhotoPicker name={me.name} value={me.photo} onChange={save} busy={busy} />
    </section>
  );
}

function PlayersList({ view, lobby = false }: { view: ClientView; lobby?: boolean }) {
  return (
    <ul className="space-y-2">
      {view.players.map((p) => (
        <PlayerRow
          key={p.id}
          p={p}
          sub={
            <>
              {p.id === view.me?.id && <span className="text-gold">You</span>}
              {lobby && <span>{p.ready ? '✓ Ready' : 'Not ready'}</span>}
              {p.revealedRoleId && <span>{ROLES[p.revealedRoleId]?.name}</span>}
              {!p.revealedRoleId && view.me?.allRoles?.[p.id] && <span className="text-gold">{ROLES[view.me.allRoles[p.id]]?.name}</span>}
              {view.me?.mafia?.team.some((t) => t.id === p.id) && p.id !== view.me.id && <span className="text-ember">🗡 Your family</span>}
            </>
          }
        />
      ))}
    </ul>
  );
}

// ======================================================================= reveal

function RevealPanel({ view, send }: { view: ClientView; send: Send }) {
  const me = view.me!;
  const { act, busy } = useAct(send);
  const prog = view.game!.revealProgress;
  return (
    <div className="space-y-4 anim-fade-up">
      <p className="text-center text-sm text-mute">Make sure nobody can see your screen.</p>
      <HoldToReveal>
        <RoleDetails roleId={me.roleId!} alignment={me.alignment!} abilities={me.abilities} settings={view.settings} />
        {me.mafia && <MafiaTeam view={view} />}
        {me.knownMafia && <GodfatherKnows view={view} />}
      </HoldToReveal>
      <button className="btn btn-gold w-full text-lg" disabled={busy || me.revealAck} onClick={() => act({ type: 'ack_role' })}>
        {me.revealAck ? `Waiting for others… ${prog ? `${prog.done}/${prog.total}` : ''}` : 'I’ve seen my role'}
      </button>
    </div>
  );
}

function MafiaTeam({ view }: { view: ClientView }) {
  const team = view.me!.mafia!.team;
  return (
    <div className="mt-4 rounded-xl border border-crimson/50 bg-crimson/10 p-3 text-left text-sm">
      <div className="eyebrow mb-2 !text-ember">🗡 Your family</div>
      <ul className="space-y-1">
        {team.map((t) => (
          <li key={t.id} className="flex justify-between">
            <span>
              {t.name}
              {t.id === view.me!.id && ' (you)'}
            </span>
            <span className="text-mute">{ROLES[t.roleId]?.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Godfather only: who the Mafia are. They do not know him. */
function GodfatherKnows({ view }: { view: ClientView }) {
  const list = view.me!.knownMafia!;
  return (
    <div className="mt-4 rounded-xl border border-crimson/50 bg-crimson/10 p-3 text-left text-sm">
      <div className="eyebrow mb-2 !text-ember">🌹 The Mafia (only you know this)</div>
      <ul className="space-y-1">
        {list.map((m) => (
          <li key={m.id}>
            {m.name}
            {!view.players.find((p) => p.id === m.id)?.alive && <span className="ml-2 text-xs text-mute">(eliminated)</span>}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-mute">They don’t know you are the Godfather. Defend them by day.</p>
    </div>
  );
}

function MyRoleButton({ view }: { view: ClientView }) {
  const me = view.me!;
  const [open, setOpen] = useState(false);
  if (!me.roleId) return null;
  return (
    <>
      <button className="btn btn-ghost w-full" onClick={() => setOpen(true)}>
        🂠 My role & private notebook
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Your secret card">
        <HoldToReveal minHeight={460}>
          <RoleDetails roleId={me.roleId} alignment={me.alignment!} abilities={me.abilities} stolen={me.stolen} settings={view.settings} compact />
          {me.mafia && <MafiaTeam view={view} />}
          {me.knownMafia && <GodfatherKnows view={view} />}
          <Notebook view={view} />
        </HoldToReveal>
        <button className="btn btn-ghost mt-3 w-full" onClick={() => setOpen(false)}>
          Close
        </button>
      </Modal>
    </>
  );
}

function Notebook({ view }: { view: ClientView }) {
  const results = view.me!.privateResults;
  return (
    <div className="mt-4 rounded-xl border border-line/70 bg-black/30 p-3 text-left text-sm">
      <div className="eyebrow mb-2 !text-[0.62rem]">Private notebook</div>
      {results.length === 0 ? (
        <p className="text-mute">No private messages yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {[...results].reverse().map((r) => (
            <li key={r.id}>
              <span className="mr-2 text-xs text-mute">Night {r.round}</span>
              {r.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ======================================================================= night

function NightPanel({ view, send }: { view: ClientView; send: Send }) {
  const me = view.me!;
  const night = me.night;
  if (!night || night.options.length === 0) {
    return (
      <div className="card p-6 text-center">
        <p className="font-[family-name:var(--font-display)] text-xl text-bone">The town sleeps.</p>
        <p className="mt-2 text-sm text-mute">Eyes closed, phone down. Wait for dawn.</p>
      </div>
    );
  }
  const allDone = night.options.every((o) => o.abilityId in night.submitted);
  const pre = view.game!.phase === 'prenight';
  return (
    <div className="space-y-3">
      <PhaseNews view={view} />
      <PrivacyShield label={allDone ? 'Review your choice' : pre ? 'Open your dawn panel' : 'Open your night panel'}>
        <div className="space-y-6 pt-6">
          {me.privateResults
            .filter((r) => r.round === view.game!.round)
            .map((r) => (
              <p key={r.id} className="rounded-xl border border-gold/40 bg-gold/5 p-3 text-sm" data-testid="private-note">
                {r.text}
              </p>
            ))}
          {night.options.map((o) => (
            <NightOptionCard key={o.abilityId} view={view} option={o} submitted={night.submitted} send={send} />
          ))}
          {me.mafia && !pre && <MafiaVotes view={view} />}
        </div>
      </PrivacyShield>
      {allDone && (
        <div className="rounded-xl border border-ok/40 bg-ok/10 p-3 text-center text-sm" role="status">
          ✓ Locked in. Put your phone face down.
        </div>
      )}
    </div>
  );
}

/**
 * The news every phone sees at the top of each phase:
 *  Dawn  → yesterday's vote result;  Night → what happened at Dawn (theft, revivals);
 *  Day   → what happened in the night.
 */
function PhaseNews({ view }: { view: ClientView }) {
  const g = view.game!;
  const want = g.phase === 'prenight' ? { kinds: ['verdict'], round: g.round - 1, title: 'Yesterday' } : g.phase === 'night' ? { kinds: ['prenight'], round: g.round, title: 'At dawn' } : { kinds: ['morning'], round: g.round, title: 'Last night' };
  const lines = view.feed.filter((f) => want.kinds.includes(f.kind) && f.round === want.round);
  if (!lines.length) return null;
  return (
    <div className="card border-gold/40 p-4 text-center anim-fade-up" role="status" data-testid="phase-news">
      <p className="eyebrow">{want.title}</p>
      {lines.map((l) => (
        <p key={l.seq} className="mt-2 font-[family-name:var(--font-serif)] text-xl leading-snug">
          {l.text}
        </p>
      ))}
    </div>
  );
}

function NightOptionCard({ view, option, submitted, send }: { view: ClientView; option: NightOption; submitted: Record<string, string | null>; send: Send }) {
  const { act, busy } = useAct(send);
  const done = option.abilityId in submitted;
  const [pick, setPick] = useState<string | null>(done ? submitted[option.abilityId] : null);
  const locked = done && !option.changeable;
  const submit = (target: string | null) =>
    act({ type: 'night_action', abilityId: option.abilityId, targetId: target, phaseSeq: view.game!.phaseSeq }, target ? 'Choice locked in.' : 'Skipped.');
  return (
    <div data-option={option.abilityId}>
      <p className="text-base text-bone">{option.prompt}</p>
      {option.charges !== null && option.source !== 'decoy' && <p className="text-xs text-mute">{option.charges} use(s) left</p>}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label={option.prompt}>
        {option.targets.map((t) => {
          const selected = pick === t;
          return (
            <button
              key={t}
              role="radio"
              aria-checked={selected}
              disabled={locked || busy}
              onClick={() => setPick(t)}
              className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-medium transition ${selected ? 'border-gold bg-gold/15 text-bone' : 'border-line bg-black/30 text-bone/90 hover:border-gold/50'}`}
            >
              {option.targetKind === 'power' ? (ABILITIES[t]?.name ?? t) : nameOf(view, t)}
              {option.targetKind === 'player' && t === view.me!.id && ' (you)'}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex gap-2">
        <button className="btn btn-primary flex-1" disabled={locked || busy || !pick || (done && submitted[option.abilityId] === pick)} onClick={() => submit(pick)}>
          {done ? (locked ? `✓ Locked: ${submitted[option.abilityId] === null ? 'skipped' : option.targetKind === 'power' ? ABILITIES[submitted[option.abilityId]!]?.name : nameOf(view, submitted[option.abilityId])}` : 'Change pick') : 'Lock in'}
        </button>
        {!done && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => submit(null)}>
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

function MafiaVotes({ view }: { view: ClientView }) {
  const m = view.me!.mafia!;
  const living = m.team.filter((t) => t.canAct);
  return (
    <div className="rounded-xl border border-crimson/50 bg-crimson/10 p-3 text-sm">
      <div className="eyebrow mb-2 !text-ember">🗡 Family picks tonight</div>
      <ul className="space-y-1">
        {living.map((t) => (
          <li key={t.id} className="flex justify-between gap-2">
            <span>{t.name}</span>
            <span className="text-mute">{t.id in m.votes ? nameOf(view, m.votes[t.id]) : '…thinking'}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-mute">
        {view.settings.mafiaDecision === 'leader' ? 'The first-seated Mafia member makes the final call.' : 'Most picks wins; ties go to the first-seated member.'} You can change your pick until the night ends.
      </p>
    </div>
  );
}

// ======================================================================= day

/** Day = news + discussion + secret ballot. The day ends once every eligible player has voted. */
function DayPanel({ view, send }: { view: ClientView; send: Send }) {
  const silenced = view.players.filter((p) => p.silenced);
  return (
    <div className="space-y-3">
      <PhaseNews view={view} />
      {silenced.length > 0 && <p className="text-center text-sm text-gold">🤐 Silenced today: {silenced.map((p) => p.name).join(', ')}</p>}
      <p className="text-center text-sm text-mute">Discuss, then vote. The day ends when everyone has voted.</p>
      <VotingPanel view={view} send={send} />
    </div>
  );
}

function VotingPanel({ view, send }: { view: ClientView; send: Send }) {
  const me = view.me!;
  const v = me.vote;
  const { act, busy } = useAct(send);
  const [pick, setPick] = useState<string | null | undefined>(v?.myVote);
  const [rally, setRally] = useState(false);
  const runoff = view.game!.runoff;
  const voted = v?.myVote !== undefined;
  const canChange = view.settings.allowVoteChange;
  const header = runoff ? <p className="text-center text-mute">Runoff: {runoff.map((id) => nameOf(view, id)).join(' vs ')}</p> : null;
  if (!v || !v.eligible) {
    return (
      <div className="space-y-3">
        {header}
        <div className="card p-5 text-center text-sm text-mute">{v?.reason ?? 'You cannot vote right now.'}</div>
        {me.alive && me.privateResults.some((r) => r.round === view.game!.round) && (
          <PrivacyShield label="You have a private message">
            <div className="space-y-2 pt-6">
              {me.privateResults
                .filter((r) => r.round === view.game!.round)
                .map((r) => (
                  <p key={r.id} className="rounded-xl border border-gold/40 bg-gold/5 p-3 text-sm" data-testid="private-note">
                    {r.text}
                  </p>
                ))}
            </div>
          </PrivacyShield>
        )}
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {header}
      <PrivacyShield label={voted ? 'Review your vote' : 'Open your ballot'}>
        <div className="space-y-4 pt-6">
          {me.privateResults
            .filter((r) => r.round === view.game!.round)
            .map((r) => (
              <p key={r.id} className="rounded-xl border border-gold/40 bg-gold/5 p-3 text-sm" data-testid="private-note">
                {r.text}
              </p>
            ))}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Vote to eliminate">
            {v.targets.map((t) => (
              <button
                key={t}
                role="radio"
                aria-checked={pick === t}
                disabled={busy || (voted && !canChange)}
                onClick={() => setPick(t)}
                className={`min-h-12 rounded-xl border px-3 py-2 text-sm font-medium ${pick === t ? 'border-crimson bg-crimson/20' : 'border-line bg-black/30 hover:border-crimson/60'}`}
              >
                {nameOf(view, t)}
              </button>
            ))}
            {view.settings.allowAbstain && (
              <button
                role="radio"
                aria-checked={pick === null}
                disabled={busy || (voted && !canChange)}
                onClick={() => setPick(null)}
                className={`min-h-12 rounded-xl border px-3 py-2 text-sm ${pick === null ? 'border-gold bg-gold/15' : 'border-dashed border-line text-mute'}`}
              >
                No one (abstain)
              </button>
            )}
          </div>
          {v.rallyAvailable && (
            <label className="mt-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={rally} onChange={(e) => setRally(e.target.checked)} className="h-5 w-5 accent-[#c9a45c]" />
              Use Rally (once per game): this vote counts double
            </label>
          )}
          <button
            className="btn btn-primary mt-4 w-full"
            disabled={busy || pick === undefined || (voted && (!canChange || pick === v.myVote))}
            onClick={() => act({ type: 'vote', targetId: pick ?? null, rally, phaseSeq: view.game!.phaseSeq }, 'Vote cast.')}
          >
            {voted ? (canChange ? 'Change vote' : `✓ Voted: ${pick === null ? 'abstain' : nameOf(view, v.myVote)}`) : pick === undefined ? 'Choose a player' : `Vote ${pick === null ? 'to abstain' : `for ${nameOf(view, pick)}`}`}
          </button>
        </div>
      </PrivacyShield>
      {voted && (
        <div className="rounded-xl border border-ok/40 bg-ok/10 p-3 text-center text-sm" role="status">
          ✓ Your vote is in.
        </div>
      )}
    </div>
  );
}

function Tally({ view }: { view: ClientView }) {
  const verdict = view.game!.lastVerdict;
  const rows = useMemo(() => Object.entries(verdict?.tally ?? {}).sort((a, b) => b[1] - a[1]), [verdict]);
  if (!verdict || rows.length === 0) return null;
  const max = Math.max(...rows.map(([, w]) => w));
  return (
    <div className="mt-4 space-y-1.5 text-left">
      {rows.map(([id, w]) => (
        <div key={id} className="text-sm">
          <div className="flex justify-between">
            <span>{id === 'abstain' ? 'No one (abstain)' : nameOf(view, id)}</span>
            <span className="tabular-nums text-mute">{w}</span>
          </div>
          <div className="h-1.5 rounded-full bg-black/40">
            <div className="h-1.5 rounded-full bg-crimson" style={{ width: `${(w / max) * 100}%` }} />
          </div>
        </div>
      ))}
      {Object.keys(verdict.votes).length > 0 && (
        <details className="pt-2 text-xs text-mute">
          <summary className="cursor-pointer">Who voted for whom</summary>
          <ul className="mt-1 space-y-0.5">
            {Object.entries(verdict.votes).map(([voter, t]) => (
              <li key={voter}>
                {nameOf(view, voter)} → {t ? nameOf(view, t) : 'abstain'}
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="pt-1 text-[0.7rem] text-mute">Weighted totals (the Judge’s vote counts extra).</p>
    </div>
  );
}

function VerdictPanel({ view }: { view: ClientView }) {
  const verdict = view.game!.lastVerdict;
  const lines = view.feed.filter((f) => f.kind === 'verdict' && f.round === view.game!.round).slice(-2);
  return (
    <div className="card p-6 text-center anim-fade-up">
      <p className="eyebrow">The verdict</p>
      {lines.map((l) => (
        <p key={l.seq} className="mt-3 font-[family-name:var(--font-serif)] text-2xl leading-snug">
          {l.text}
        </p>
      ))}
      {view.game!.pendingTie && <p className="mt-3 text-sm text-gold">Waiting for the Game Master to break the tie…</p>}
      {verdict && <Tally view={view} />}
    </div>
  );
}

// ======================================================================= game over

export function GameOverPanel({ view, hostControls }: { view: ClientView; hostControls?: ReactNode }) {
  const g = view.game!;
  const w = g.winner!;
  const winners = new Set(w.winnerIds);
  const headline = { good: 'The Town Prevails', mafia: 'The Mafia Rules', jester: 'The Jester Laughs Last', draw: 'Nobody Survives', none: 'Game Ended' }[w.faction];
  const me = view.me;
  const iWon = me ? winners.has(me.id) : false;
  const stats = g.stats;
  const topSuspect = stats ? Object.entries(stats.suspicion).sort((a, b) => b[1] - a[1])[0] : undefined;
  return (
    <div className="space-y-4 anim-fade-up">
      <div className="card p-6 text-center">
        <p className="eyebrow">Game over</p>
        <h2 className="brand-title mt-2 text-4xl font-black">{headline}</h2>
        <p className="mt-2 text-mute">{w.reason}</p>
        {me && <p className={`mt-4 text-lg font-semibold ${iWon ? 'text-gold' : 'text-mute'}`}>{iWon ? '🏆 You won!' : 'You did not win this time.'}</p>}
        {hostControls}
      </div>
      <Section title="Every role, revealed">
        <ul className="grid gap-2 sm:grid-cols-2">
          {view.players.map((p: PublicPlayer) => {
            const r = p.revealedRoleId ? ROLES[p.revealedRoleId] : null;
            const a = p.revealedRoleId ? roleAlignment(p.revealedRoleId, view.settings) : null;
            return (
              <li key={p.id} className={`flex items-center gap-3 rounded-xl border p-2.5 ${winners.has(p.id) ? 'border-gold/60 bg-gold/5' : 'border-line/60'}`}>
                <Avatar name={p.name} photo={p.photo} dead={!p.alive} size={44} />
                {r && <RoleArt art={r.art} alignment={a} size={36} />}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">
                    {p.name} {winners.has(p.id) && <span className="text-gold">🏆</span>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-mute">
                    {r?.name} {a && <AlignmentBadge alignment={a} />} <span>{p.alive ? 'Survived' : '☠ Eliminated'}</span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Section>
      {stats && (
        <Section title="The night in numbers">
          <dl className="grid grid-cols-2 gap-3 text-center sm:grid-cols-4">
            {[
              ['Night kills', stats.nightKills],
              ['Lives saved', stats.saves],
              ['Revivals', stats.revives],
              ['Voted out', stats.voteEliminations],
            ].map(([k, v]) => (
              <div key={k as string} className="rounded-xl border border-line/60 p-3">
                <dt className="text-xs text-mute">{k}</dt>
                <dd className="font-[family-name:var(--font-display)] text-2xl text-gold">{v}</dd>
              </div>
            ))}
          </dl>
          {topSuspect && <p className="mt-3 text-center text-sm text-mute">Most suspected by the town at night: {nameOf(view, topSuspect[0])}</p>}
        </Section>
      )}
      {!hostControls && (
        <p className="text-center text-sm text-mute">
          Waiting for the host to start another round… or{' '}
          <Link to="/" className="text-gold underline">
            leave
          </Link>
          .
        </p>
      )}
    </div>
  );
}

