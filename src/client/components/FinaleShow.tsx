import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ROLES, roleShort } from '../../shared/roles';
import type { Settings } from '../../shared/settings';
import type { ClientView, PublicPlayer } from '../../shared/view-types';
import { finale, type FinaleGroup } from '../lib/finale';
import { serverUrl } from '../lib/server';
import { Confetti, winHeadline } from './ui';

/**
 * The end of the game: every role, grouped so anyone can read it from across the room —
 * the Mafia (names only; the Godfather is marked), the neutral characters (with what they were),
 * then the Town: the special characters first, then the villagers.
 *
 * Every screen plays it on the same clock, counted from the moment the game ended (server time):
 * a phone that wakes up or reconnects halfway joins the show at the right moment instead of
 * missing it or starting late. Built from fades and scales only, so it stays smooth on TVs and
 * older phones.
 */

/** Seconds since the game ended, fixed when this screen first sees the end (per game). */
export function useFinaleElapsed(view: ClientView | null, serverNow: () => number): number | null {
  const g = view?.game ?? null;
  const over = g?.phase === 'game_over';
  const ref = useRef<{ key: number; elapsed: number } | null>(null);
  if (!over || !g) {
    ref.current = null;
    return null;
  }
  if (ref.current?.key !== g.phaseSeq) {
    const ended = g.endedAt ?? serverNow();
    ref.current = { key: g.phaseSeq, elapsed: Math.max(0, (serverNow() - ended) / 1000) };
  }
  return ref.current.elapsed;
}

/** On a phone: the show is on until it ends (and never replays for a game that ended long ago). */
export function useFinaleShow(view: ClientView | null, serverNow: () => number): { on: boolean; key: number; elapsed: number } {
  const elapsed = useFinaleElapsed(view, serverNow);
  const key = view?.game?.phaseSeq ?? -1;
  const end = view && elapsed !== null ? finale(view.players, view.settings).end : 0;
  const [doneKey, setDoneKey] = useState<number | null>(null);
  useEffect(() => {
    if (elapsed === null) return;
    const t = setTimeout(() => setDoneKey(key), Math.max(0, end - elapsed + 0.4) * 1000);
    return () => clearTimeout(t);
  }, [key, elapsed === null]);
  return { on: elapsed !== null && elapsed < end && doneKey !== key, key, elapsed: elapsed ?? 0 };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/** What to print under a name: nothing for a plain Mafia member or villager (the group says it). */
export function finaleRoleLabel(p: PublicPlayer, settings: Settings): { main: string; classic: string | null } | null {
  const id = p.revealedRoleId;
  if (!id || id === 'villager' || id === 'mafia') return null;
  const main = roleShort(id, settings);
  const classic = settings.bollywood && ROLES[id] && ROLES[id].name !== main ? ROLES[id].name : null;
  return { main, classic };
}

/** Card size: everyone fits on one screen, as big as the table allows. */
function cardSize(n: number, variant: 'tv' | 'phone') {
  if (variant === 'phone') return n <= 9 ? '20vw' : n <= 14 ? '18vw' : '16vw';
  return n <= 6 ? 'min(17vh, 13vw)' : n <= 9 ? 'min(15vh, 11vw)' : n <= 12 ? 'min(13vh, 9.5vw)' : n <= 16 ? 'min(11.5vh, 8vw)' : n <= 20 ? 'min(10vh, 7vw)' : 'min(9vh, 6vw)';
}

function Card({ p, group, view, at }: { p: PublicPlayer; group: FinaleGroup['key']; view: ClientView; at: string }) {
  const label = finaleRoleLabel(p, view.settings);
  return (
    <div className={`fc fc-${group}`} style={{ ['--at' as string]: at }} data-player={p.name} data-role={p.revealedRoleId ?? ''}>
      <div className={`fc-photo ${p.alive ? '' : 'is-out'}`}>
        {p.photo ? <img src={serverUrl(p.photo)} alt="" draggable={false} /> : <span className="fc-initials">{initials(p.name)}</span>}
        {!p.alive && (
          <span className="fc-out" aria-label="eliminated">
            ☠
          </span>
        )}
      </div>
      <div className="fc-name">{p.name}</div>
      {label && (
        <div className="fc-role">
          {label.main}
          {label.classic && <small>{label.classic}</small>}
        </div>
      )}
    </div>
  );
}

export function FinaleShow({ view, variant, elapsed, persist = false }: { view: ClientView; variant: 'tv' | 'phone'; elapsed: number; persist?: boolean }) {
  const fin = finale(view.players, view.settings);
  const at = (t: number) => `${(t - elapsed).toFixed(2)}s`;
  const group = (k: FinaleGroup['key']) => fin.groups.find((g) => g.key === k);
  const mafia = group('mafia');
  const neutral = group('neutral');
  const special = group('special');
  const villager = group('villager');
  const town = [special, villager].filter((g): g is FinaleGroup => !!g);
  const w = cardSize(view.players.length, variant);
  // On the TV the whole board must fit one screen: shrink the cards until nothing scrolls.
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el || variant !== 'tv') return;
    const fit = () => {
      let f = 1;
      el.style.setProperty('--fit', '1');
      for (let i = 0; i < 14 && el.scrollHeight > el.clientHeight + 1; i++) {
        f *= 0.93;
        el.style.setProperty('--fit', f.toFixed(3));
      }
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, [variant, view.players.length]);
  const g = view.game!;
  const win = g.winner;
  const cards = (grp: FinaleGroup) => (
    <div className="fs-row">
      {grp.players.map((p) => (
        <Card key={p.id} p={p} group={grp.key} view={view} at={at(fin.cardAt.get(p.id) ?? grp.start)} />
      ))}
    </div>
  );
  return createPortal(
    <div
      ref={root}
      className={`fs fs-${variant} ${persist ? 'fs-persist' : ''}`}
      style={{ ['--end' as string]: `${fin.end}s`, ['--start' as string]: `${(-elapsed).toFixed(2)}s`, ['--w' as string]: `calc(${w} * var(--fit, 1))` }}
      aria-live="polite"
      data-testid={variant === 'tv' ? 'tv-finale' : 'phone-finale'}
    >
      <p className="fs-suspense" style={{ ['--at' as string]: at(fin.suspenseAt) }} aria-hidden="true">
        And the Mafia were…
      </p>
      {persist && win && (
        <header className="fs-win" style={{ ['--at' as string]: at(fin.end) }}>
          <h2>{winHeadline(win.faction, !!view.settings.bollywood)}</h2>
          <p>{win.reason}</p>
        </header>
      )}
      <div className="fs-board">
        {mafia && (
          <section className="fs-panel fs-p-mafia" style={{ ['--at' as string]: at(mafia.start) }} aria-label="The Mafia">
            <h3 className="fs-title">
              The Mafia <span>{mafia.players.length}</span>
            </h3>
            {cards(mafia)}
          </section>
        )}
        {neutral && (
          <section className="fs-panel fs-p-neutral" style={{ ['--at' as string]: at(neutral.start) }} aria-label="Neutral">
            <h3 className="fs-title">
              Neutral <span>{neutral.players.length}</span>
            </h3>
            {cards(neutral)}
          </section>
        )}
        {town.length > 0 && (
          <section className="fs-panel fs-p-town" style={{ ['--at' as string]: at(town[0].start) }} aria-label="The Town">
            <h3 className="fs-title">
              The Town <span>{town.reduce((n, t) => n + t.players.length, 0)}</span>
            </h3>
            <div className="fs-town">
              {town.map((t) => (
                <div key={t.key} className={`fs-sub fs-sub-${t.key}`} style={{ ['--at' as string]: at(t.start) }}>
                  <h4 className="fs-subtitle">{t.title}</h4>
                  {cards(t)}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      {persist && win && win.faction !== 'none' && win.faction !== 'draw' && elapsed < fin.end + 1 && <Confetti palette={view.settings.bollywood ? 'party' : win.faction} count={90} delay={Math.max(0, fin.end - elapsed)} />}
    </div>,
    document.body,
  );
}
