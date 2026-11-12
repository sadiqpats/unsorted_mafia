import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { roleTitle } from '../../shared/roles';
import type { ClientView, PublicPlayer } from '../../shared/view-types';
import { serverUrl } from '../lib/server';

/**
 * The big public moments, on the TV and on every phone:
 *  - the Day begins: everyone hit in the night gets a card — killed (a knife slashes the card in
 *    two, with blood), brought back (the pieces join again in gold), silenced (tape across it);
 *  - after the vote: the player voted out gets the knife; after an even round, a flash card
 *    shows how many Mafia are still alive.
 * Public information only — exactly what the announcements say.
 */

export type MomentKind = 'killed' | 'voted' | 'revived' | 'silenced';
export type MomentCardData = { id: string; kind: MomentKind };
export type Moment = { key: number; title: string; cards: MomentCardData[]; note: string | null; mafiaLeft: number | null; seconds: number; superpower?: boolean; sticky?: boolean; tally?: VoteRow[] };
/** One row of the vote count: who got how many votes (and, when votes are public, from whom). */
export type VoteRow = { id: string; weight: number; voters: string[] };

/** Watches the game for a new Day or a vote result and returns the moment to show (or null). */
export function useMoments(view: ClientView | null, { startDelayMs = 1900, maxSeconds = 60, sticky = false }: { startDelayMs?: number; maxSeconds?: number; sticky?: boolean } = {}): Moment | null {
  const [moment, setMoment] = useState<Moment | null>(null);
  const prev = useRef<{ phase: string; key: number } | null>(null);
  const g = view?.game ?? null;
  const key = g?.phaseSeq ?? -1;
  useEffect(() => {
    if (!g || !view) return;
    const before = prev.current;
    prev.current = { phase: g.phase, key };
    if (!before || before.key === key) return; // first sight (or a reload): no replay
    let next: Omit<Moment, 'key'> | null = null;
    const m = g.lastMorning;
    if (g.phase === 'discussion' && before.phase === 'night' && m && m.round === g.round) {
      const cards: MomentCardData[] = [
        ...m.deaths.map((id) => ({ id, kind: 'killed' as const })),
        ...m.revived.map((id) => ({ id, kind: 'revived' as const })),
        ...m.silenced.map((id) => ({ id, kind: 'silenced' as const })),
      ];
      const saved = m.saved ? `${roleTitle('doctor', view.settings)} saved a life tonight.` : null;
      next = { title: 'Last night…', cards, note: cards.some((c) => c.kind === 'killed') ? saved : (saved ?? 'A quiet night — nobody died.'), mafiaLeft: null, seconds: 8 };
      if (m.superpower) {
        // The Godfather's Superpower (Mahastra): its own big reveal, a little longer.
        const bw = !!view.settings.bollywood;
        const n = m.deaths.length;
        const note = bw
          ? n >= 2 ? `${n} log maare gaye.` : n === 1 ? (m.saved ? 'Ek ki jaan gayi — ek bach gaya.' : 'Ek ki jaan gayi.') : 'Lekin koi nahi mara!'
          : n >= 2 ? `${n} people were killed.` : n === 1 ? (m.saved ? 'One was killed — one survived.' : 'One person was killed.') : '…but nobody died!';
        next = { title: bw ? 'Mahastra ka istemaal hua!' : 'The Godfather used his Superpower!', cards, note, mafiaLeft: null, seconds: 10, superpower: true };
      }
    } else if (g.phase === 'night' && before.phase === 'prenight' && g.lastDawn && g.lastDawn.round === g.round && g.lastDawn.revived.length) {
      // Someone came back at Dawn: their card rises from the dead, for 5 seconds.
      next = { title: 'Back from the dead!', cards: g.lastDawn.revived.map((id) => ({ id, kind: 'revived' as const })), note: null, mafiaLeft: null, seconds: 5 };
    } else if ((before.phase === 'voting' || (before.phase === 'verdict' && g.phase === 'verdict')) && g.lastVerdict && (g.phase === 'verdict' ? !g.pendingTie : g.phase === 'prenight' || g.phase === 'night')) {
      const v = g.lastVerdict;
      const left = g.mafiaLeft && g.mafiaLeft.round === v.round ? g.mafiaLeft.count : null;
      // Exactly as long as the pause on the result (8 s by default) — never longer.
      const secs = Math.max(3, view.settings.verdictSeconds || 8);
      // The count, when the house rules make it public: votes land one by one before the knife falls.
      const tally: VoteRow[] = Object.entries(v.tally)
        .filter(([, w]) => w > 0)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 4)
        .map(([id, weight]) => ({ id, weight, voters: Object.entries(v.votes).filter(([, t]) => (t ?? 'abstain') === id).map(([voter]) => voter) }));
      next = { title: 'The town has spoken', cards: v.eliminatedId ? [{ id: v.eliminatedId, kind: 'voted' }] : [], note: v.eliminatedId ? null : 'Nobody was voted out.', mafiaLeft: left, seconds: secs, tally: tally.length ? tally : undefined };
    }
    if (!next) return;
    // A phone keeps it up until it is tapped (or the phase moves on), but only in the phases with
    // nothing to do. At Dawn and Night the clock is running: their panels must never stay covered.
    const stay = sticky && (g.phase === 'discussion' || g.phase === 'verdict');
    const s = { ...next, seconds: Math.min(next.seconds, maxSeconds), sticky: stay };
    const delay = g.phase === 'verdict' ? 0 : startDelayMs; // no curtain before the vote result
    const show = setTimeout(() => setMoment({ ...s, key }), delay);
    const hide = stay ? undefined : setTimeout(() => setMoment((cur) => (cur?.key === key ? null : cur)), delay + s.seconds * 1000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [key]);
  // A new phase (or the end of the game) clears it at once.
  useEffect(() => {
    if (moment && moment.key !== key) setMoment(null);
  }, [key]);
  return moment;
}

const LABEL: Record<MomentKind, string> = {
  killed: 'Killed in the night',
  voted: 'Voted out',
  silenced: 'Silenced today',
  revived: 'Back from the dead',
};

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** The card face: the player's photo, their name, and (when public) what they were. */
function Face({ p, role }: { p: PublicPlayer; role: string | null }) {
  return (
    <>
      {p.photo ? <img src={serverUrl(p.photo)} alt="" draggable={false} className="mc-photo" /> : <span className="mc-initials">{initials(p.name)}</span>}
      <span className="mc-namebar">
        <span className="mc-name">{p.name}</span>
        {role && <span className="mc-role">{role}</span>}
      </span>
    </>
  );
}

export function MomentCard({ view, card, width, delay = 0 }: { view: ClientView; card: MomentCardData; width: string; delay?: number }) {
  const p = view.players.find((x) => x.id === card.id);
  if (!p) return null;
  const dead = card.kind === 'killed' || card.kind === 'voted';
  const role = p.revealedRoleId && dead ? roleTitle(p.revealedRoleId, view.settings) : null;
  const split = dead || card.kind === 'revived';
  return (
    <div className={`mc mc-${card.kind}`} style={{ ['--w' as string]: width, ['--d' as string]: `${delay}s` }} data-player={p.name} data-testid="moment-card">
      <div className="mc-card">
        {split ? (
          <>
            <div className="mc-face mc-top">
              <Face p={p} role={role} />
            </div>
            <div className="mc-face mc-bottom">
              <Face p={p} role={role} />
            </div>
          </>
        ) : (
          <div className="mc-face">
            <Face p={p} role={role} />
          </div>
        )}
        {dead && (
          <div className="mc-track" aria-hidden="true">
            <span className="mc-cut" />
            <svg className="mc-knife" viewBox="0 0 120 30" aria-hidden="true">
              <path d="M2 15 L78 6 Q90 15 78 24 Z" fill="#e8e6e3" stroke="#9aa0a6" strokeWidth="1.5" />
              <path d="M10 15 L76 9" stroke="#fff" strokeWidth="1.2" opacity="0.7" />
              <rect x="78" y="10" width="8" height="10" rx="2" fill="#3a2a22" />
              <rect x="86" y="9" width="32" height="12" rx="5" fill="#5b3a29" stroke="#2a1a12" strokeWidth="1.5" />
            </svg>
            {[8, 22, 37, 51, 64, 78, 90].map((x, i) => (
              <span key={x} className="mc-drop" style={{ left: `${x}%`, ['--i' as string]: i }} />
            ))}
          </div>
        )}
        {card.kind === 'revived' && <span className="mc-halo" aria-hidden="true" />}
        {card.kind === 'silenced' && (
          <span className="mc-tape" aria-hidden="true">
            SILENCED
          </span>
        )}
      </div>
      <span className="mc-what">{LABEL[card.kind]}</span>
    </div>
  );
}

/** "N Mafia still among you" — a flash card after even rounds. */
export function MafiaCountCard({ count, delay = 0 }: { count: number; delay?: number }) {
  return (
    <div className="mafia-count" style={{ ['--d' as string]: `${delay}s` }} data-testid="mafia-count" role="status">
      <span className="mafia-count-flash" aria-hidden="true" />
      <span className="mafia-count-label">Mafia still among you</span>
      <span className="mafia-count-num">{count}</span>
      <span className="mafia-count-sub">{count === 1 ? 'Only one left…' : 'Who could they be?'}</span>
    </div>
  );
}

/** The full-screen moment: on the TV (big, with the clock) or on a phone (tap to close). */
export function MomentsOverlay({ moment, view, variant, clock, onClose }: { moment: Moment; view: ClientView; variant: 'tv' | 'phone'; clock?: ReactNode; onClose?: () => void }) {
  const n = moment.cards.length;
  const width =
    variant === 'tv'
      ? n <= 1
        ? moment.mafiaLeft !== null ? 'min(22vh, 18vw)' : 'min(30vh, 24vw)'
        : n === 2
          ? 'min(27vh, 22vw)'
          : n === 3
            ? 'min(23vh, 19vw)'
            : 'min(18vh, 15vw)'
      : n <= 1
        ? moment.mafiaLeft !== null ? 'min(40vw, 20vh)' : 'min(52vw, 27vh)'
        : n === 2
          ? 'min(34vw, 22vh)'
          : 'min(26vw, 17vh)';
  // The vote count plays first (a pip every 0.14 s, at most ~2 s), then the cards.
  const pips = moment.tally?.reduce((s, r) => s + Math.min(r.weight, 12), 0) ?? 0;
  const tallyTime = moment.tally ? Math.min(2, 0.5 + pips * 0.14) : 0;
  const countDelay = tallyTime + 0.4 + n * 0.45 + (n ? 2.2 : 0.3);
  // On the TV everything must fit one screen: shrink the whole moment until nothing is cut off.
  const box = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const outer = box.current;
    const inner = body.current;
    if (!outer || !inner || variant !== 'tv') return;
    const fit = () => {
      inner.style.setProperty('--fit', '1');
      const cs = getComputedStyle(outer);
      const room = outer.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
      const need = inner.scrollHeight;
      inner.style.setProperty('--fit', need > room ? (room / need).toFixed(3) : '1');
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [variant, moment.key]);
  return (
    <div ref={box} className={`moments moments-${variant} ${moment.superpower ? 'moments-super' : ''}`} role="status" aria-live="polite" data-testid={variant === 'tv' ? 'tv-spotlight' : 'phone-moment'} onClick={onClose}>
      {clock && <div className="moments-clock">{clock}</div>}
      <div ref={body} className="moments-body">
      {moment.superpower && (
        <span className="super-emblem" aria-hidden="true">
          <span className="super-ring" />
          ⚡
        </span>
      )}
      <p className="moments-title">{moment.title}</p>
      {moment.tally && <VoteCount rows={moment.tally} view={view} step={tallyTime / Math.max(1, pips)} />}
      {/* The voted-out card and the Mafia count sit side by side on a TV, stacked on a phone. */}
      <div className="moments-row">
        {n > 0 && (
          <div className="moments-cards">
            {moment.cards.map((c, i) => (
              <MomentCard key={c.id + c.kind} view={view} card={c} width={width} delay={tallyTime + 0.35 + i * 0.45} />
            ))}
          </div>
        )}
        {moment.mafiaLeft !== null && <MafiaCountCard count={moment.mafiaLeft} delay={countDelay} />}
      </div>
      {moment.note && <p className="moments-note">{moment.note}</p>}
      {variant === 'phone' && <p className="moments-tap">👆 Tap anywhere to continue</p>}
      </div>
      {!moment.sticky && <span className="moments-bar" style={{ ['--secs' as string]: `${moment.seconds}s` }} aria-hidden="true" />}
      {moment.cards.some((c) => c.kind === 'revived') && <RiseSparks />}
    </div>
  );
}

/** The vote count: each row fills with its votes, one pip at a time, the leader last to finish. */
function VoteCount({ rows, view, step }: { rows: VoteRow[]; view: ClientView; step: number }) {
  let k = 0;
  return (
    <ul className="vc" data-testid="vote-count" aria-label="Vote count">
      {rows.map((r) => {
        const p = view.players.find((x) => x.id === r.id);
        const count = Math.min(Math.round(r.weight), 12);
        return (
          <li key={r.id} className="vc-row">
            <span className="vc-name">{p ? p.name : 'No one'}</span>
            <span className="vc-pips">
              {Array.from({ length: count }, (_, i) => {
                const voter = view.players.find((x) => x.id === r.voters[i]);
                return (
                  <span key={i} className="vc-pip" style={{ animationDelay: `${(0.3 + k++ * step).toFixed(2)}s` }} title={voter?.name}>
                    {voter ? initials(voter.name) : ''}
                  </span>
                );
              })}
            </span>
            <span className="vc-num">{r.weight}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** On a phone: the same moment. It stays until a tap anywhere closes it, so nobody misses it. */
export function PhoneMoments({ view }: { view: ClientView }) {
  const moment = useMoments(view, { maxSeconds: 8, sticky: true });
  const [closed, setClosed] = useState<number | null>(null);
  if (!moment || closed === moment.key) return null;
  // On <body>, over the header too: "tap anywhere" must never land on the Home button underneath.
  return createPortal(<MomentsOverlay key={moment.key} moment={moment} view={view} variant="phone" onClose={() => setClosed(moment.key)} />, document.body);
}

/** Golden sparks drifting up behind a revival. */
function RiseSparks() {
  return (
    <div className="rise-sparks" aria-hidden="true">
      {Array.from({ length: 26 }, (_, i) => (
        <span key={i} style={{ left: `${(i * 37 + 11) % 100}%`, animationDelay: `${((i * 0.29) % 2.4).toFixed(2)}s`, animationDuration: `${2.6 + ((i * 0.53) % 1.8)}s` }} />
      ))}
    </div>
  );
}
