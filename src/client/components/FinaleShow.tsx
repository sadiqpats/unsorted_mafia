import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ROLES, roleAlignment, roleArt, roleShort } from '../../shared/roles';
import type { ClientView, PublicPlayer } from '../../shared/view-types';
import { finale } from '../lib/finale';
import { serverUrl } from '../lib/server';
import { RoleArt } from './RoleArt';

/**
 * The end of the game, as one full-screen show on the TV and on every phone (same timeline as
 * the home lights): "And the Mafia were…", each Mafia card slams in big — photo, name and
 * character — then everyone else appears, then the show fades and the winner is announced.
 * Plays only on a screen that saw the game end (a reload shows the result straight away).
 * Built from simple moves (fade, scale, slide) so it stays smooth on TVs and older phones.
 */
export function useFinaleShow(view: ClientView | null): { on: boolean; key: number } {
  const g = view?.game ?? null;
  const over = g?.phase === 'game_over';
  const prev = useRef<string | null>(null);
  const live = useRef(false);
  if (over && prev.current !== 'game_over') live.current = prev.current !== null;
  prev.current = g?.phase ?? null;
  const key = g?.phaseSeq ?? -1;
  const [doneKey, setDoneKey] = useState<number | null>(null);
  useEffect(() => {
    if (!over || !live.current || !view) return;
    const t = setTimeout(() => setDoneKey(key), (finale(view.players, view.settings).end + 0.7) * 1000);
    return () => clearTimeout(t);
  }, [over, key]);
  return { on: over && live.current && doneKey !== key, key };
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

function Card({ p, view, at, big }: { p: PublicPlayer; view: ClientView; at: number; big: boolean }) {
  const a = p.revealedRoleId ? roleAlignment(p.revealedRoleId, view.settings) : null;
  return (
    <div className={`fs-card ${big ? 'fs-big' : 'fs-small'} fs-${a ?? 'none'}`} style={{ ['--at' as string]: `${at}s` }} data-player={p.name}>
      <div className="fs-photo">
        {p.photo ? <img src={serverUrl(p.photo)} alt="" draggable={false} /> : <span className="fs-initials">{initials(p.name)}</span>}
        {!p.alive && <span className="fs-dead" aria-hidden="true" />}
        <span className="fs-badge" aria-hidden="true">
          <RoleArt art={roleArt(p.revealedRoleId, view.settings)} alignment={a} size={big ? 64 : 34} />
        </span>
        <span className="fs-name">{p.name}</span>
      </div>
      <span className="fs-role">
        {roleShort(p.revealedRoleId, view.settings)}
        {view.settings.bollywood && p.revealedRoleId && <small> ({ROLES[p.revealedRoleId].name})</small>}
      </span>
    </div>
  );
}

export function FinaleShow({ view, variant }: { view: ClientView; variant: 'tv' | 'phone' }) {
  const fin = finale(view.players, view.settings);
  const mafia = fin.groups.find((g) => g.key === 'mafia');
  const rest = fin.groups.filter((g) => g.key !== 'mafia');
  const restStart = rest[0]?.start ?? fin.end;
  return createPortal(
    <div className={`fs fs-${variant}`} style={{ ['--end' as string]: `${fin.end}s` }} aria-live="polite" data-testid={variant === 'tv' ? 'tv-finale' : 'phone-finale'}>
      <p className="fs-suspense" style={{ ['--at' as string]: `${fin.suspenseAt}s` }}>
        And the Mafia were…
      </p>
      {mafia && (
        <section className="fs-group fs-mafia" aria-label="The Mafia" style={{ ['--at' as string]: `${mafia.start}s` }}>
          <h3 className="fs-head">The Mafia</h3>
          <div className="fs-row">
            {mafia.players.map((p) => (
              <Card key={p.id} p={p} view={view} at={fin.cardAt.get(p.id) ?? mafia.start} big />
            ))}
          </div>
        </section>
      )}
      {rest.length > 0 && (
        <section className="fs-group fs-rest" aria-label="Everyone else" style={{ ['--at' as string]: `${restStart}s` }}>
          {rest.map((grp) => (
            <div key={grp.key} className="fs-sub">
              <h3 className="fs-head fs-head-small" style={{ ['--at' as string]: `${grp.start}s` }}>
                {grp.title}
              </h3>
              <div className="fs-row">
                {grp.players.map((p) => (
                  <Card key={p.id} p={p} view={view} at={fin.cardAt.get(p.id) ?? grp.start} big={false} />
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>,
    document.body,
  );
}
