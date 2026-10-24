import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { NightOption } from '../../shared/engine';
import type { Ack, CommandInput } from '../../shared/protocol';
import { ABILITIES, ROLES, roleAlignment, roleArt, roleShort, roleTitle, themeText } from '../../shared/roles';
import type { Alignment } from '../../shared/types';
import type { ClientView, PublicPlayer } from '../../shared/view-types';
import { Avatar } from '../components/Avatar';
import { HoldToReveal, PrivacyShield, RoleDetails } from '../components/RoleCard';
import { useFx, usePrefs } from '../lib/prefs';
import { revealPlan } from '../lib/reveal';
import { PhotoPicker } from '../components/PhotoPicker';
import { RoleArt } from '../components/RoleArt';
import { PhoneMoments } from '../components/Moments';
import { FinaleShow, finaleRoleLabel, useFinaleShow } from '../components/FinaleShow';
import { MafiaChat } from '../components/MafiaChat';
import { finale } from '../lib/finale';
import { uploadPhoto } from '../lib/photo';
import { loadSession } from '../lib/session';
import { AlignmentBadge, Feed, LOGO, Modal, PHASE_LABEL, Section, Timer, useCountdown, useToast, winHeadline, Confetti } from '../components/ui';

type Send = (c: CommandInput) => Promise<Ack>;

export interface GameProps {
  view: ClientView;
  send: Send;
  serverNow: () => number;
}

export function useAct(send: Send) {
  const toast = useToast();
  const { play, buzz } = useFx();
  const [busy, setBusy] = useState(false);
  const act = async (cmd: CommandInput, okMsg?: string) => {
    setBusy(true);
    const a = await send(cmd);
    setBusy(false);
    if (!a.ok) toast(a.error?.message ?? 'That didn’t work.', 'error');
    else {
      // Every player locks in / votes, so this identical cue reveals nothing.
      if (cmd.type === 'night_action' || cmd.type === 'vote') {
        // In offline games player phones are silenced globally (see useGameAudio); the buzz is private.
        play('seal');
        buzz(25);
      }
      if (okMsg) toast(okMsg);
    }
    return a;
  };
  return { act, busy };
}

const GROUP_TEXT: Record<string, string> = { mafia: 'text-ember', neutral: 'text-[#c9b6ff]', special: 'text-[#8fe0a8]', villager: 'text-gold' };
const GROUP_BORDER: Record<string, string> = { mafia: 'border-crimson/60 bg-crimson/10', neutral: 'border-[#b096eb]/50 bg-[#503c8c]/15', special: 'border-[#8fe0a8]/40 bg-[#5a7850]/10', villager: 'border-gold/35' };

const nameOf = (view: ClientView, id: string | null | undefined) => (id ? (view.players.find((p) => p.id === id)?.name ?? '—') : 'Nobody');

const ACTION_PHASES = ['prenight', 'night', 'voting'];

/**
 * One player to pick (night action, Dawn or the vote): their photo, big, with the name under it —
 * two to a row, so everyone can find the face they mean. The accessible name stays the player's
 * name (plus "(you)" / the family's picks), exactly as before.
 */
function PlayerChoice({ view, id, selected, tone = 'gold', disabled, onPick, children }: { view: ClientView; id: string; selected: boolean; tone?: 'gold' | 'crimson'; disabled: boolean; onPick: () => void; children?: ReactNode }) {
  const p = view.players.find((x) => x.id === id);
  const on = tone === 'crimson' ? 'border-crimson bg-crimson/20 ring-2 ring-crimson/60' : 'border-gold bg-gold/15 ring-2 ring-gold/60';
  return (
    <button
      role="radio"
      aria-checked={selected}
      disabled={disabled}
      onClick={onPick}
      className={`choice-tile relative flex min-h-[8rem] flex-col items-center justify-start gap-2 rounded-2xl border px-2 pb-3 pt-3 text-center ${selected ? on : 'border-line bg-black/30 hover:border-gold/50'}`}
    >
      <span aria-hidden="true" className={`block w-full max-w-[84px] rounded-[18%] transition-transform ${selected ? 'scale-105' : ''}`}>
        <Avatar name={p?.name ?? '?'} photo={p?.photo ?? null} size={84} className="!h-auto aspect-square !w-[min(84px,100%)]" />
      </span>
      {selected && (
        <span aria-hidden="true" className={`absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full text-sm font-bold ${tone === 'crimson' ? 'bg-crimson text-white' : 'bg-gold text-ink'}`}>
          ✓
        </span>
      )}
      <span className="block w-full break-words text-base font-semibold leading-tight text-bone">
        {p?.name ?? '—'}
        {id === view.me?.id && ' (you)'}
      </span>
      {children}
    </button>
  );
}

/** The announcements list without the lines already shown in this phase's news card (no repeats). */
function withoutNews(view: ClientView) {
  const g = view.game;
  if (!g || !['prenight', 'night', 'discussion', 'voting'].includes(g.phase)) return view.feed;
  const shown = new Set(g.news.map((n) => n.seq));
  return view.feed.filter((e) => !shown.has(e.seq));
}

function CheckMark() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" className="check-draw text-ok" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

// ======================================================================= root

export function PlayerGame({ view, send, serverNow }: GameProps) {
  const me = view.me!;
  const g = view.game;
  if (view.status === 'lobby' || !g) return <PlayerLobby view={view} send={send} />;
  const phase = g.phase;
  return (
    <div className="space-y-4">
      <PhoneMoments view={view} />
      <PhaseHeader view={view} serverNow={serverNow} />
      {me.alive || phase === 'game_over' ? null : <DeadBanner view={view} />}
      {me.silenced && me.alive && phase !== 'game_over' && (
        <div className="rounded-xl border border-gold/50 bg-gold/10 p-3 text-center text-sm" role="status">
          🤐 <b>You have been silenced.</b> Do not speak during today’s discussion.{' '}
          {view.settings.silencedCanVote ? 'You can still vote.' : 'You cannot vote today.'}
        </div>
      )}
      {me.heir && me.alive && phase !== 'game_over' && (
        <div className="rounded-xl border border-ember/50 bg-crimson/10 p-3 text-center text-sm" role="status" data-testid="heir-banner">
          🩸 <b>The Mafia have fallen — the family is yours.</b> Each night you now choose who dies, as well as who is silenced.
        </div>
      )}
      {phase === 'reveal' && <RevealPanel view={view} send={send} />}
      {(phase === 'night' || phase === 'prenight') && <NightPanel key={g.phaseSeq} view={view} send={send} serverNow={serverNow} />}
      {phase === 'discussion' && <DiscussionPanel view={view} />}
      {phase === 'voting' && <DayPanel key={g.phaseSeq} view={view} send={send} />}
      {phase === 'verdict' && <VerdictPanel view={view} />}
      {phase === 'game_over' && <GameOverPanel view={view} serverNow={serverNow} />}
      {me.mafiaChat && phase !== 'game_over' && <MafiaChat view={view} send={send} />}
      {/* Action phases show ONLY the action — no lists, feeds or extra buttons. */}
      {phase === 'voting' && <MyRoleButton view={view} />}
      {/* The dead have no action, so they always get the full running commentary. */}
      {!me.alive && ACTION_PHASES.includes(phase) && (
        <Section title="Announcements">
          <Feed entries={withoutNews(view)} limit={20} inGame />
        </Section>
      )}
      {!ACTION_PHASES.includes(phase) && (
        <>
          {phase !== 'reveal' && phase !== 'game_over' && <MyRoleButton view={view} />}
          {phase !== 'game_over' && (
            <Section title="Town square">
              <PlayersList view={view} />
            </Section>
          )}
          <Section title="Announcements">
            {/* Lines already in this phase's news card aren't repeated here. */}
            <Feed entries={withoutNews(view)} limit={12} inGame />
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
        <div className="eyebrow">{roundLabel || (view.settings.bollywood ? 'Bollywood Mafia Night' : 'Mafia Night')}</div>
        <h1 key={g.phase} className="phase-title-in font-[family-name:var(--font-display)] text-4xl text-bone">{PHASE_LABEL[g.phase]}</h1>
      </div>
      <Timer endsAt={g.phaseEndsAt} opensAt={g.phaseOpensAt} serverNow={serverNow} pausedMs={g.pausedRemainingMs} />
    </div>
  );
}

function DeadBanner({ view }: { view: ClientView }) {
  const me = view.me!;
  return (
    <>
      <div className="death-card rounded-xl border border-line bg-black/60 p-4 text-center" role="status">
        <div className="death-skull text-3xl" aria-hidden="true">
          ☠
        </div>
        <p className="mt-1 font-[family-name:var(--font-display)] text-lg">You have been eliminated</p>
        <p className="mt-1 text-sm text-mute">Stay silent — no hints, no faces. You can keep watching the game here.</p>
      </div>
      {me.allRoles && view.game?.phase !== 'game_over' && <DeadRoles view={view} />}
    </>
  );
}

/** House rule "the dead can see every role": behind its own self-closing shield, never left open on the table. */
function DeadRoles({ view }: { view: ClientView }) {
  const roles = view.me!.allRoles!;
  return (
    <PrivacyShield label="Who is who (only the dead can open this)">
      <ul className="space-y-1.5 pt-11 text-sm">
        {view.players.map((p) => (
          <li key={p.id} className="flex justify-between gap-2 rounded-lg bg-black/30 px-3 py-2">
            <span>{p.name}</span>
            <span className="text-gold">{roleTitle(roles[p.id], view.settings) || '—'}</span>
          </li>
        ))}
      </ul>
    </PrivacyShield>
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
          <span className="chip text-good">🛡️ Town {d.byAlignment.good}</span>
          <span className="chip text-ember">🗡 Mafia {d.byAlignment.mafia}</span>
          {d.byAlignment.evil > 0 && <span className="chip text-[#e07ac8]">😈 Evil {d.byAlignment.evil}</span>}
          <span className="chip text-neutral">◆ Neutral {d.byAlignment.neutral}</span>
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {counts.map(([id, c]) => (
            <li key={id} className="flex items-center gap-2 rounded-lg border border-line/60 p-2 text-sm">
              <RoleArt art={roleArt(id, view.settings)} alignment={roleAlignment(id, view.settings)} size={32} />
              <span>
                {roleTitle(id, view.settings)} {c > 1 && <span className="text-mute">×{c}</span>}
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

/**
 * Everyone at the table as photo cards, three to a row on a phone (more on wider screens), so a
 * table of 12 fits on one screen and you can see at a glance who is playing. During a game the living come first and the dead move to
 * the end, as on the TV.
 */
function PlayersList({ view, lobby = false }: { view: ClientView; lobby?: boolean }) {
  const players = lobby ? view.players : [...view.players.filter((p) => p.alive), ...view.players.filter((p) => !p.alive)];
  return (
    <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6" aria-label="Players">
      {players.map((p) => {
        const me = p.id === view.me?.id;
        // Nothing secret in this always-visible list: a neighbour could glance at an awake phone.
        // Mafia teammates live behind the hold-to-reveal card and the night panel; the dead's
        // role list sits behind its own shield (DeadRoles).
        const role = p.revealedRoleId ? roleTitle(p.revealedRoleId, view.settings) : view.game?.phase === 'game_over' && view.me?.allRoles?.[p.id] ? roleTitle(view.me.allRoles[p.id], view.settings) : null;
        return (
          <li
            key={p.id}
            data-player={p.name}
            className={`anim-slide-in relative flex min-w-0 flex-col items-center rounded-xl border px-1.5 pb-1.5 pt-2 text-center ${me ? 'border-gold/60 bg-gold/[0.06]' : 'border-line/60 bg-white/[0.02]'} ${p.alive ? '' : 'opacity-60'}`}
          >
            <span className="relative block w-[82%] max-w-[7.5rem]">
              <Avatar name={p.name} photo={p.photo} dead={!p.alive} size={96} className={`aspect-square !h-auto !w-full ${lobby && !p.ready ? 'opacity-50' : ''}`} />
              <span className={`absolute -bottom-1 -right-1 z-10 h-3.5 w-3.5 rounded-full border-2 border-coal ${p.connected ? 'bg-ok' : 'bg-ash'}`} title={p.connected ? 'Connected' : 'Disconnected'} aria-hidden="true" />
              {p.isHost && <span className="absolute -left-1 -top-1 z-10 rounded-full bg-gold px-1.5 py-0.5 text-[0.6rem] font-bold tracking-wider text-ink">HOST</span>}
            </span>
            <span className={`mt-1.5 block w-full truncate text-base font-bold leading-tight ${p.alive ? 'text-bone' : 'text-mute line-through decoration-ember/70'}`}>{p.name}</span>
            <span className="flex flex-wrap justify-center gap-x-1.5 text-[0.7rem] leading-4 text-mute">
              <span className="sr-only">{p.connected ? 'connected' : 'disconnected'}</span>
              {me && <span className="font-semibold text-gold">You</span>}
              {lobby && <span>{p.ready ? '✓ Ready' : 'Not ready'}</span>}
              {!p.alive && <span>☠ {p.deathCause === 'vote' ? 'Voted out' : p.deathCause === 'host' ? 'Removed' : 'Killed at night'}</span>}
              {p.silenced && <span className="text-gold">🤐 Silenced today</span>}
              {role && <span className={p.revealedRoleId ? '' : 'text-gold'}>{role}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ======================================================================= reveal

function RevealPanel({ view, send }: { view: ClientView; send: Send }) {
  const me = view.me!;
  const { act, busy } = useAct(send);
  const prog = view.game!.revealProgress;
  return (
    <div className="space-y-3 anim-fade-up">
      <p className="text-center text-sm text-mute">Make sure nobody can see your screen.</p>
      {/* Sized to the screen so "I've seen my role" is visible without scrolling. */}
      <HoldToReveal minHeight="clamp(300px, calc(100dvh - 400px), 560px)">
        {/* Team info first: a held card can't be scrolled, so it must be visible straight away. */}
        {(me.mafia || me.knownMafia) && <RoleBadge roleId={me.roleId!} alignment={me.alignment!} settings={view.settings} />}
        {me.mafia && <MafiaTeam view={view} />}
        {me.knownMafia && <GodfatherKnows view={view} />}
        <div className={me.mafia || me.knownMafia ? 'mt-5 border-t border-line/50 pt-4' : ''}>
          <RoleDetails roleId={me.roleId!} alignment={me.alignment!} abilities={me.abilities} settings={view.settings} compact={!!(me.mafia || me.knownMafia)} />
        </div>
      </HoldToReveal>
      <button className="btn btn-gold w-full text-lg" disabled={busy || me.revealAck} onClick={() => act({ type: 'ack_role' })}>
        {me.revealAck ? `Waiting for others… ${prog ? `${prog.done}/${prog.total}` : ''}` : 'I’ve seen my role'}
      </button>
    </div>
  );
}

/** Small "You are the Mafia" header shown above the team list on the role card. */
function RoleBadge({ roleId, alignment, settings }: { roleId: string; alignment: Alignment; settings: ClientView['settings'] }) {
  return (
    <div className="flex items-center gap-3">
      <RoleArt art={roleArt(roleId, settings)} alignment={alignment} size={56} />
      <div className="text-left">
        <div className="eyebrow !text-[0.62rem]">You are{settings.bollywood ? '' : ' the'}</div>
        <div className="brand-title text-2xl font-bold">{roleShort(roleId, settings)}</div>
        {settings.bollywood && <div className="text-xs text-mute">({ROLES[roleId].name})</div>}
      </div>
    </div>
  );
}

/** A Mafia member's family (names + photos): on the role card and again at night. */
function MafiaTeam({ view }: { view: ClientView }) {
  const team = view.me!.mafia!.team;
  const others = team.filter((t) => t.id !== view.me!.id);
  return (
    <div className="mt-4 rounded-xl border border-crimson/50 bg-crimson/10 p-3 text-left text-sm" data-testid="mafia-family">
      <div className="eyebrow mb-2 !text-ember">🗡 Your family {others.length ? `— ${others.length === 1 ? 'the other Mafia' : `the other ${others.length} Mafia`}` : ''}</div>
      {others.length === 0 && <p className="text-mute">You’re the only Mafia. Make it count.</p>}
      <ul className="space-y-2">
        {others.map((t) => {
          const pl = view.players.find((p) => p.id === t.id);
          return (
            <li key={t.id} className="flex items-center gap-3">
              <Avatar name={t.name} photo={pl?.photo ?? null} dead={!pl?.alive} size={40} />
              <span>
                <b className="text-bone">{t.name}</b>
                {!pl?.alive && <span className="ml-2 text-xs text-mute">(eliminated)</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-mute">{themeText('You never learn who the Godfather is.', view.settings)}</p>
    </div>
  );
}

/** Godfather only: who the Mafia are (names + photos). They do not know him. */
function GodfatherKnows({ view }: { view: ClientView }) {
  const list = view.me!.knownMafia!;
  return (
    <div className="mt-4 rounded-xl border border-crimson/50 bg-crimson/10 p-3 text-left text-sm" data-testid="godfather-knows">
      <div className="eyebrow mb-2 !text-ember">🎩 The Mafia (only you know this)</div>
      <ul className="space-y-2">
        {list.map((m) => {
          const pl = view.players.find((p) => p.id === m.id);
          return (
            <li key={m.id} className="flex items-center gap-3">
              <Avatar name={m.name} photo={pl?.photo ?? null} dead={!pl?.alive} size={40} />
              <span>
                <b className="text-bone">{m.name}</b>
                {!pl?.alive && <span className="ml-2 text-xs text-mute">(eliminated)</span>}
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-mute">{themeText('They don’t know you are the Godfather. Protect them by day.', view.settings)}</p>
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
        🃏 My role & private notebook
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Your secret card">
        <HoldToReveal minHeight={460}>
          {me.mafia && <MafiaTeam view={view} />}
          {me.knownMafia && <GodfatherKnows view={view} />}
          <RoleDetails roleId={me.roleId} alignment={me.alignment!} abilities={me.abilities} stolen={me.stolen} settings={view.settings} compact />
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
              <span className="mr-2 text-xs text-mute">Round {r.round}</span>
              {r.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ======================================================================= night

function NightPanel({ view, send, serverNow }: { view: ClientView; send: Send; serverNow: () => number }) {
  const me = view.me!;
  const night = me.night;
  const g = view.game!;
  const toOpen = useCountdown(g.phaseOpensAt, serverNow, g.pausedRemainingMs);
  const waiting = toOpen !== null && toOpen > 0 && g.pausedRemainingMs === null;
  const picks = useNightPicks(view, send, !waiting && g.pausedRemainingMs === null);
  if (!night || night.options.length === 0) {
    // Nothing to do (e.g. eliminated): still see what just happened.
    return (
      <div className="space-y-3">
        <PhaseNews view={view} />
        <div className="card p-6 text-center">
          <p className="font-[family-name:var(--font-display)] text-xl text-bone">{me.alive ? 'The town sleeps.' : 'The living are making their moves…'}</p>
          <p className="mt-2 text-sm text-mute">{me.alive ? 'Eyes closed, phone down. Wait for dawn.' : 'Watch quietly — every update appears here as it happens.'}</p>
        </div>
      </div>
    );
  }
  const allDone = night.options.every((o) => o.abilityId in night.submitted);
  const pre = view.game!.phase === 'prenight';
  if (waiting) {
    // The short break at the start of Dawn/Night: the news lands, everyone gets ready.
    return (
      <div className="space-y-3">
        <PhaseNews view={view} />
        <div className="card p-6 text-center" data-testid="get-ready">
          <p className="eyebrow">{pre ? 'Dawn' : 'Night'} begins in</p>
          <p className="mt-1 font-[family-name:var(--font-display)] text-6xl tabular-nums text-gold">{Math.ceil(toOpen / 1000)}</p>
          <p className="mt-2 text-sm text-mute">{view.settings.timers === false ? 'Then take your time to choose.' : `Then you have ${fmtDuration(pre ? view.settings.preNightSeconds : view.settings.nightSeconds)} to choose. Anything not chosen in time doesn’t count.`}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <PhaseNews view={view} />
      <PrivacyShield label={allDone ? 'Review your choice' : pre ? 'Open your dawn panel' : 'Open your night panel'}>
        <div className="space-y-6 pt-11">
          <PrivateNotes view={view} />
          {me.mafia && !pre && <MafiaTeam view={view} />}
          {me.hitPlan && !pre && <MafiaVotes view={view} />}
          {me.knownMafia && !pre && <GodfatherKnows view={view} />}
          {night.options.map((o) => (
            <NightOptionCard key={o.abilityId} view={view} option={o} submitted={night.submitted} send={send} pick={picks.get(o.abilityId)} setPick={(t) => picks.set(o.abilityId, t)} />
          ))}
        </div>
      </PrivacyShield>
      {allDone && (
        <div className="stamp-in flex items-center justify-center gap-2 rounded-xl border border-ok/40 bg-ok/10 p-3 text-center text-sm" role="status">
          <CheckMark /> Locked in. Put your phone face down.
        </div>
      )}
    </div>
  );
}

const NEWS_TITLE: Record<string, string> = {
  verdict: 'The vote',
  prenight: 'At dawn',
  morning: 'Last night',
  gm: 'From the Game Master',
  correction: 'Game Master correction',
  pause: 'Game Master',
};

/**
 * The news every phone sees at the top of a phase: exactly the public announcements
 * made since the previous phase began — never older ones, never repeated.
 */
function PhaseNews({ view }: { view: ClientView }) {
  const news = view.game!.news ?? [];
  if (!news.length) return null;
  // Lines appear one by one, in step with their sounds (see useGameAudio).
  const plan = revealPlan(news);
  const order = new Map(news.map((n, i) => [n.seq, i]));
  const groups: { kind: string; lines: typeof news }[] = [];
  for (const n of news) {
    const title = NEWS_TITLE[n.kind] ?? 'News';
    const last = groups[groups.length - 1];
    if (last && NEWS_TITLE[last.kind] === title) last.lines.push(n);
    else groups.push({ kind: n.kind, lines: [n] });
  }
  return (
    <div className="card space-y-3 border-gold/40 p-4 text-center anim-fade-up" role="status" data-testid="phase-news">
      {groups.map((grp) => (
        <div key={grp.lines[0].seq}>
          <p className="eyebrow">{NEWS_TITLE[grp.kind] ?? 'News'}</p>
          {grp.lines.map((l) => (
            <p key={l.seq} className={`news-line ${l.tag ? `news-${l.tag}` : ''} mt-1.5 font-[family-name:var(--font-serif)] text-xl leading-snug`} style={{ animationDelay: `${plan.at(order.get(l.seq) ?? 0) - 0.9}s` }}>
              {l.text.replace(/^📣\s*/, '')}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Private notes that arrived for this phase (shown once — older ones live in the notebook). */
function freshNotes(view: ClientView) {
  const from = view.game?.newsFromAt ?? 0;
  return view.me!.privateResults.filter((r) => r.at > from);
}

function PrivateNotes({ view }: { view: ClientView }) {
  const notes = freshNotes(view);
  return (
    <>
      {notes.map((r) => (
        <p key={r.id} className="rounded-xl border border-gold/40 bg-gold/5 p-3 text-sm" data-testid="private-note">
          {r.text}
        </p>
      ))}
    </>
  );
}

/** The Mafia hit can be changed all night, so a tap locks it in straight away. */
const isInstant = (o: NightOption) => o.abilityId === 'mafia_kill' && o.changeable;

/**
 * Tonight's picks, kept by the whole night panel — so a pick survives the panel hiding itself
 * (it closes after 15 s) — and made to reach the server:
 *  - the Mafia hit is sent as soon as it is tapped, and sent again if a tap was missed (a second
 *    tap while the first was on its way, a tap during a pause) until the server has that pick;
 *  - any pick that was tapped but never locked in is sent just before the clock runs out.
 */
function useNightPicks(view: ClientView, send: Send, open: boolean) {
  const night = view.me!.night;
  const submitted = night?.submitted ?? {};
  const options = night?.options ?? [];
  const [picks, setPicks] = useState<Record<string, string | null>>(() => ({ ...submitted }));
  const inFlight = useRef<Record<string, string | null>>({});
  const tried = useRef<Record<string, string | null>>({});
  const phaseSeq = view.game!.phaseSeq;
  const failures = useRef<Record<string, number>>({});
  const push = (abilityId: string, targetId: string | null) => {
    inFlight.current[abilityId] = targetId;
    tried.current[abilityId] = targetId;
    send({ type: 'night_action', abilityId, targetId, phaseSeq })
      .catch(() => null)
      .then((a) => {
        delete inFlight.current[abilityId];
        if (!a?.ok && (failures.current[abilityId] = (failures.current[abilityId] ?? 0) + 1) <= 3) {
          // Refused (e.g. a flaky connection): try again shortly, a few times.
          setTimeout(() => {
            delete tried.current[abilityId];
            setPicks((p) => ({ ...p }));
          }, 1200);
        }
        setPicks((p) => ({ ...p })); // look again: the pick may have changed meanwhile
      });
  };
  // A pause or the opening break ending: try again what didn't stick.
  useEffect(() => {
    if (!open) return;
    tried.current = {};
    failures.current = {};
  }, [open]);
  useEffect(() => {
    if (!open) return;
    for (const o of options) {
      const want = picks[o.abilityId];
      if (!isInstant(o) || want == null || submitted[o.abilityId] === want) continue;
      if (o.abilityId in inFlight.current || tried.current[o.abilityId] === want) continue;
      push(o.abilityId, want);
    }
  });
  const pending = () => options.filter((o) => {
    const want = picks[o.abilityId];
    if (want == null) return false;
    return !(o.abilityId in submitted) || (o.changeable && submitted[o.abilityId] !== want);
  });
  useLastSecondLock(view, pending().length > 0, () => {
    for (const o of pending()) push(o.abilityId, picks[o.abilityId] ?? null);
  });
  return {
    get: (abilityId: string) => picks[abilityId] ?? null,
    set: (abilityId: string, t: string | null) => setPicks((p) => ({ ...p, [abilityId]: t })),
  };
}

function NightOptionCard({ view, option, submitted, send, pick, setPick }: { view: ClientView; option: NightOption; submitted: Record<string, string | null>; send: Send; pick: string | null; setPick: (t: string | null) => void }) {
  const { act, busy } = useAct(send);
  const done = option.abilityId in submitted;
  const locked = done && !option.changeable;
  // Mafia hit: which (anonymous) members picked each target, so the family lines up without talking.
  const familyOn: Record<string, string[]> = {};
  const plan = view.me!.hitPlan;
  if (plan && option.abilityId === 'mafia_kill') {
    for (const slot of plan.slots) if (!slot.you && slot.pick) (familyOn[slot.pick] ??= []).push(slot.label);
  }
  const submit = (target: string | null) =>
    act({ type: 'night_action', abilityId: option.abilityId, targetId: target, phaseSeq: view.game!.phaseSeq });
  // The Mafia hit locks in on the tap itself (NightPanel sends it, and re-sends until it sticks).
  const instant = isInstant(option);
  const choose = (t: string) => setPick(t);
  const sending = instant && pick !== null && submitted[option.abilityId] !== pick;
  return (
    <div data-option={option.abilityId}>
      {option.source === 'decoy' && (
        <div className="mb-3 rounded-xl border border-neutral/40 bg-neutral/10 p-3" data-testid="dummy-round">
          <span className="chip border-neutral/60 text-neutral">🎭 DUMMY ROUND</span>
          <p className="mt-2 text-xs text-mute">You have no power this round. Your pick doesn’t change anything — everyone taps so nobody can tell who has a role.</p>
        </div>
      )}
      <p className="text-base text-bone">{option.prompt}</p>
      {option.charges !== null && option.source !== 'decoy' && <p className="text-xs text-mute">{option.charges} use(s) left</p>}
      <div className={`mt-3 grid ${option.targetKind === 'player' ? `${option.targets.length > 8 ? 'grid-cols-3 gap-2' : 'grid-cols-2 gap-3'}` : 'grid-cols-2 gap-2 sm:grid-cols-3'}`} role="radiogroup" aria-label={option.prompt}>
        {option.targets.map((t) => {
          const selected = pick === t;
          if (option.targetKind === 'player') {
            return (
              <PlayerChoice key={t} view={view} id={t} selected={selected} disabled={locked || (busy && !instant)} onPick={() => choose(t)}>
                {familyOn[t]?.length ? <span className="block text-[0.75rem] font-semibold text-ember">🗡 {familyOn[t].join(', ')}</span> : null}
              </PlayerChoice>
            );
          }
          return (
            <button
              key={t}
              role="radio"
              aria-checked={selected}
              disabled={locked || busy}
              onClick={() => choose(t)}
              className={`choice-tile min-h-12 rounded-xl border px-3 py-2 text-sm font-medium ${selected ? 'border-gold bg-gold/15 text-bone' : 'border-line bg-black/30 text-bone/90 hover:border-gold/50'}`}
            >
              {themeText(ABILITIES[t]?.name ?? t, view.settings)}
            </button>
          );
        })}
      </div>
      {sending && (
        <p className="mt-2 text-center text-xs text-gold" role="status">
          Locking in…
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <button className="btn btn-primary flex-1" disabled={locked || busy || !pick || (done && submitted[option.abilityId] === pick)} onClick={() => submit(pick)}>
          {done ? (locked || (instant && submitted[option.abilityId] === pick) ? `✓ Locked: ${submitted[option.abilityId] === null ? 'skipped' : option.targetKind === 'power' ? ABILITIES[submitted[option.abilityId]!]?.name : nameOf(view, submitted[option.abilityId])}` : 'Change pick') : 'Lock in'}
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

/**
 * Tonight's hit, anonymised: every voter shows as "Mafia 1/2/3…" (shuffled each night). A
 * Thief holding the stolen hit votes too, and nobody can tell which slot is him — nor can he
 * tell who the Mafia are.
 */
function MafiaVotes({ view }: { view: ClientView }) {
  const plan = view.me!.hitPlan;
  if (!plan) return null;
  const others = plan.slots.filter((x) => !x.you);
  const mine = plan.slots.find((x) => x.you);
  const picks = plan.slots.map((x) => x.pick);
  const allIn = picks.every((p) => p !== undefined);
  const chosen = picks.filter((p): p is string => typeof p === 'string');
  const agreed = allIn && chosen.length === plan.slots.length && new Set(chosen).size === 1;
  return (
    <div className="anim-fade-up rounded-xl border border-crimson/50 bg-crimson/10 p-3 text-sm" data-testid="family-plan">
      <div className="eyebrow mb-2 !text-ember">🗡 Tonight’s hit {mine ? `· you are ${mine.label}` : ''}</div>
      {!plan.youVote && <p className="mb-2 text-mute">Your power is gone for this round — you can only watch the plan.</p>}
      {others.length === 0 ? (
        <p className="text-mute">You make the call alone tonight.</p>
      ) : (
        <ul className="space-y-1.5">
          {others.map((x) => (
            <li key={x.label}>
              <b className="text-bone">{x.label}</b>{' '}
              {x.pick === undefined ? (
                <span className="text-mute">is still choosing…</span>
              ) : x.pick === null ? (
                <span className="text-mute">wants to skip the kill</span>
              ) : (
                <>
                  <span className="text-mute">wants to kill</span> <b className="text-ember">{nameOf(view, x.pick)}</b>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {others.length > 0 && (
        <p className={`mt-2 rounded-lg px-2 py-1.5 text-xs ${agreed ? 'bg-ok/15 text-bone' : 'bg-black/30 text-mute'}`}>
          {agreed
            ? `✅ You all agree: ${nameOf(view, chosen[0])}.`
            : view.settings.mafiaDecision === 'leader'
              ? `${plan.leaderLabel === mine?.label ? 'You make' : `${plan.leaderLabel} makes`} the final call. You can change your pick until the night ends.`
              : `Pick the same person. If picks differ, most picks wins; a tie goes to ${plan.leaderLabel === mine?.label ? 'you' : plan.leaderLabel}.`}
        </p>
      )}
      <p className="mt-2 text-[0.7rem] text-mute">Names are hidden here on purpose: numbers change every night.</p>
    </div>
  );
}

// ======================================================================= day

/** Day = news + discussion + secret ballot. The day ends once every eligible player has voted. */
/** Day: the news, then talk. No clock — the host opens the vote when the table is ready. */
function DiscussionPanel({ view }: { view: ClientView }) {
  return (
    <div className="space-y-3">
      <PhaseNews view={view} />
      {view.me!.alive && freshNotes(view).length > 0 && (
        <PrivacyShield label="You have a private message">
          <div className="space-y-2 pt-11">
            <PrivateNotes view={view} />
          </div>
        </PrivacyShield>
      )}
      <div className="card p-5 text-center" data-testid="discussion">
        <div className="text-3xl" aria-hidden="true">
          🗣️
        </div>
        <p className="mt-1 font-[family-name:var(--font-display)] text-xl text-bone">Discuss. Accuse. Defend.</p>
        <p className="mt-1 text-sm text-mute">{discussionLine(view)}</p>
      </div>
    </div>
  );
}

function DayPanel({ view, send }: { view: ClientView; send: Send }) {
  return (
    <div className="space-y-3">
      <PhaseNews view={view} />
      <p className="text-center text-sm text-mute">{view.settings.timers === false ? 'Everyone votes — the result comes when all the votes are in.' : 'Vote before the clock runs out — a missing vote simply doesn’t count.'}</p>
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
  // A vote tapped but not sent (or changed but not re-sent) still counts: it goes just before the clock ends.
  const unsent = !!v && pick !== undefined && (v.myVote === undefined || (view.settings.allowVoteChange && pick !== v.myVote));
  useLastSecondLock(view, unsent, () => pick !== undefined && act({ type: 'vote', targetId: pick ?? null, rally, phaseSeq: view.game!.phaseSeq }));
  const runoff = view.game!.runoff;
  const voted = v?.myVote !== undefined;
  const canChange = view.settings.allowVoteChange;
  const header = runoff ? <p className="text-center text-mute">Runoff: {runoff.map((id) => nameOf(view, id)).join(' vs ')}</p> : null;
  if (!v || !v.eligible) {
    return (
      <div className="space-y-3">
        {header}
        <div className="card p-5 text-center text-sm text-mute">{v?.reason ?? 'You cannot vote right now.'}</div>
        {me.alive && freshNotes(view).length > 0 && (
          <PrivacyShield label="You have a private message">
            <div className="space-y-2 pt-11">
              <PrivateNotes view={view} />
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
        <div className="space-y-4 pt-11">
          <PrivateNotes view={view} />
          <div className={`grid ${(v?.targets.length ?? 0) > 8 ? 'grid-cols-3 gap-2' : 'grid-cols-2 gap-3'}`} role="radiogroup" aria-label="Vote to eliminate">
            {v.targets.map((t) => (
              <PlayerChoice key={t} view={view} id={t} tone="crimson" selected={pick === t} disabled={busy || (voted && !canChange)} onPick={() => setPick(t)} />
            ))}
            {view.settings.allowAbstain && (
              <button
                role="radio"
                aria-checked={pick === null}
                disabled={busy || (voted && !canChange)}
                onClick={() => setPick(null)}
                className={`choice-tile min-h-[9.5rem] rounded-2xl border px-3 py-2 text-base ${pick === null ? 'border-gold bg-gold/15 ring-2 ring-gold/60' : 'border-dashed border-line text-mute'}`}
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
            onClick={() => act({ type: 'vote', targetId: pick ?? null, rally, phaseSeq: view.game!.phaseSeq })}
          >
            {voted ? (canChange ? 'Change vote' : `✓ Voted: ${pick === null ? 'abstain' : nameOf(view, v.myVote)}`) : pick === undefined ? 'Choose a player' : `Vote ${pick === null ? 'to abstain' : `for ${nameOf(view, pick)}`}`}
          </button>
        </div>
      </PrivacyShield>
      {voted && (
        <div className="stamp-in flex items-center justify-center gap-2 rounded-xl border border-ok/40 bg-ok/10 p-3 text-center text-sm" role="status">
          <CheckMark /> Your vote is in.
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
      <p className="pt-1 text-[0.7rem] text-mute">{themeText('Weighted totals (the Judge’s vote counts extra).', view.settings)}</p>
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

function GoldDust() {
  const { prefs } = usePrefs();
  const bits = useMemo(
    () => Array.from({ length: 28 }, (_, i) => ({ left: (i * 37) % 100, delay: (i * 0.53) % 6, dur: 5 + ((i * 1.7) % 5), size: 4 + (i % 4) })),
    [],
  );
  if (prefs.reduceMotion || prefs.lowLight) return null;
  return (
    <div className="gold-dust" aria-hidden="true">
      {bits.map((b, i) => (
        <span key={i} style={{ left: `${b.left}%`, animationDelay: `${b.delay}s`, animationDuration: `${b.dur}s`, width: b.size, height: b.size }} />
      ))}
    </div>
  );
}

export function GameOverPanel({ view, serverNow, hostControls }: { view: ClientView; serverNow: () => number; hostControls?: ReactNode }) {
  const g = view.game!;
  const w = g.winner!;
  const winners = new Set(w.winnerIds);
  const headline = winHeadline(w.faction, !!view.settings.bollywood);
  const me = view.me;
  const iWon = me ? winners.has(me.id) : false;
  const stats = g.stats;
  const topSuspect = stats ? Object.entries(stats.suspicion).sort((a, b) => b[1] - a[1])[0] : undefined;
  // The same groups as the TV: the Mafia, the neutral characters, then the Town (special characters, then villagers).
  const fin = useMemo(() => finale(view.players, view.settings), [view.players, view.settings]);
  // The full-screen show plays first (in step with the TV, even on a phone that reconnects late).
  const show = useFinaleShow(view, serverNow);
  const afterShow = Math.max(0, fin.end - show.elapsed);
  return (
    <div className="space-y-4 anim-fade-up">
      {show.on && <FinaleShow key={show.key} view={view} variant="phone" elapsed={show.elapsed} />}
      <GoldDust />
      {(iWon || !me) && (w.faction === 'good' || w.faction === 'mafia' || w.faction === 'jester') && show.elapsed < fin.end + 1 && <Confetti palette={view.settings.bollywood ? 'party' : w.faction} delay={afterShow} />}
      <div className="card relative z-10 p-6 text-center">
        <p className="eyebrow">Game over</p>
        <h2 className="brand-title headline-drop mt-2 text-4xl font-black" style={{ animationDelay: `${afterShow}s` }}>
          {headline}
        </h2>
        <p className="mt-2 text-mute">
          {w.reason}
        </p>
        {me && (
          <p className={`mt-4 text-lg font-semibold ${iWon ? 'text-gold' : 'text-mute'}`}>
            {iWon ? '🏆 You won!' : 'You did not win this time.'}
          </p>
        )}
        {hostControls}
      </div>
      <Section title="Every role, revealed">
        <div className="space-y-4" data-testid="roles-revealed">
          {fin.groups.map((grp) => (
            <div key={grp.key}>
              <h3 className={`mb-2 font-[family-name:var(--font-display)] text-sm font-bold tracking-[0.18em] uppercase ${GROUP_TEXT[grp.key]}`}>
                {grp.key === 'special' || grp.key === 'villager' ? `The Town · ${grp.title}` : grp.title} · {grp.players.length}
              </h3>
              <ul className="grid grid-cols-2 gap-2">
                {grp.players.map((p: PublicPlayer) => {
                  const label = finaleRoleLabel(p, view.settings);
                  return (
                    <li key={p.id} className={`flex items-center gap-2.5 rounded-xl border p-2 ${GROUP_BORDER[grp.key]}`}>
                      <Avatar name={p.name} photo={p.photo} dead={!p.alive} size={48} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-base font-bold leading-tight text-bone">
                          {p.name} {winners.has(p.id) && <span className="text-gold">🏆</span>}
                        </div>
                        {label && (
                          <div className={`truncate text-sm font-semibold leading-tight ${GROUP_TEXT[grp.key]}`}>
                            {label.main}
                            {label.classic && <span className="ml-1 text-xs font-medium text-mute">({label.classic})</span>}
                          </div>
                        )}
                        {!p.alive && <div className="text-xs text-mute">☠ Out</div>}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
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
      <img src={LOGO.full} alt="Unsorted — Plans worth showing up for." className="mx-auto h-auto w-56 opacity-80" />
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

/** What the discussion card says, for the timer settings in use. */
function discussionLine(view: ClientView): string {
  const s = view.settings;
  if (s.timers === false) return 'Take your time. The host opens the vote when the table is ready.';
  const vote = fmtDuration(s.voteSeconds ?? 30);
  if (s.discussionTimer === false) return `Take your time. The host opens the vote when the table is ready — then you have ${vote}.`;
  return `You have ${fmtDuration(s.daySeconds ?? 240)} to talk. The vote opens when the clock runs out (or when the host starts it) — then you have ${vote}.`;
}

/** 60 → "1 minute", 90 → "90 seconds", 600 → "10 minutes", 210 → "3½ minutes". */
function fmtDuration(sec: number): string {
  if (sec % 60 === 0) return sec === 60 ? '1 minute' : `${sec / 60} minutes`;
  if (sec % 30 === 0 && sec > 60) return `${Math.floor(sec / 60)}½ minutes`;
  return `${sec} seconds`;
}

/**
 * Run `fire` once, 2.5 s before the phase clock runs out, if `armed` is still true then — so a
 * choice someone tapped but forgot to lock in still counts.
 */
function useLastSecondLock(view: ClientView, armed: boolean, fire: () => void) {
  const g = view.game!;
  const ref = useRef({ armed, fire });
  ref.current = { armed, fire };
  useEffect(() => {
    if (!g.phaseEndsAt || g.paused) return;
    const offset = view.serverNow - Date.now(); // the server's clock minus ours
    const ms = g.phaseEndsAt - offset - Date.now() - 2500;
    if (ms < -2000) return;
    const t = setTimeout(() => ref.current.armed && ref.current.fire(), Math.max(0, ms));
    return () => clearTimeout(t);
  }, [g.phaseSeq, g.phaseEndsAt, g.paused]);
}
