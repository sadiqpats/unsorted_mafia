import type { ClientView, PublicPlayer } from '../../shared/view-types';
import { Avatar } from './Avatar';

/** One colour per group so people spot theirs from across the room. */
const COLORS = ['#e2c27d', '#e0645a', '#5fb7a8', '#a98be0'];

type Groups = NonNullable<NonNullable<ClientView['game']>['groups']>;

const clock = (ms: number | null) => (ms == null ? '' : `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, '0')}`);

function members(view: ClientView, ids: string[]) {
  return ids.map((id) => view.players.find((p) => p.id === id)).filter((p): p is PublicPlayer => !!p);
}

/** The line under the groups: walk to your place, or talk. */
export function groupsLine(groups: Groups) {
  if (groups.started) return 'Talk in your group. Come back to your seats when the clock ends.';
  return `Go to your group’s place. The host starts the talking${groups.heldMs ? ` (${clock(groups.heldMs)})` : ''}.`;
}

/** A player's phone: their own group, big, then the other groups small. No roles anywhere. */
export function MyGroup({ view }: { view: ClientView }) {
  const groups = view.game!.groups!;
  const meId = view.me?.id;
  const mine = groups.list.findIndex((g) => !!meId && g.includes(meId));
  return (
    <div className="card p-4" data-testid="my-group">
      {mine >= 0 ? (
        <>
          <p className="eyebrow text-center">Group discussion</p>
          <p className="mt-1 text-center font-[family-name:var(--font-display)] text-3xl" style={{ color: COLORS[mine % COLORS.length] }}>
            You’re in Group {mine + 1}
          </p>
          <p className="mt-1 text-center text-sm text-mute">{groupsLine(groups)}</p>
          <ul className="mt-3 grid grid-cols-2 gap-2">
            {members(view, groups.list[mine])
              .filter((p) => p.id !== meId)
              .map((p) => (
                <li key={p.id} className="flex min-w-0 items-center gap-2 rounded-lg border border-white/10 bg-white/5 p-1.5">
                  <Avatar name={p.name} photo={p.photo} size={36} />
                  <span className="truncate text-sm font-semibold text-bone">{p.name}</span>
                </li>
              ))}
          </ul>
        </>
      ) : (
        <>
          <p className="eyebrow text-center">Group discussion</p>
          <p className="mt-1 text-center text-sm text-mute">The living are talking in groups. Watch and listen.</p>
        </>
      )}
      <ul className="mt-3 space-y-1 border-t border-white/10 pt-3 text-xs text-mute">
        {groups.list.map((g, i) =>
          i === mine ? null : (
            <li key={i} className="truncate">
              <b style={{ color: COLORS[i % COLORS.length] }}>Group {i + 1}:</b> {members(view, g).map((p) => p.name).join(', ')}
            </li>
          ),
        )}
      </ul>
    </div>
  );
}

/** The TV and the host: every group side by side. */
export function GroupsBoard({ view, size = 'host' }: { view: ClientView; size?: 'tv' | 'host' }) {
  const groups = view.game!.groups!;
  const tv = size === 'tv';
  return (
    <div className={`grid grid-cols-2 gap-[1.2vh] ${tv ? 'h-full content-center' : ''}`} data-testid={tv ? 'tv-groups' : 'host-groups'}>
      {groups.list.map((g, i) => (
        <section key={i} className="min-w-0 rounded-2xl border-2 bg-black/30 p-[1.2vh]" style={{ borderColor: COLORS[i % COLORS.length] }}>
          <h3 className={`font-[family-name:var(--font-display)] ${tv ? 'text-[clamp(1.4rem,4.5vh,2.6rem)]' : 'text-lg'}`} style={{ color: COLORS[i % COLORS.length] }}>
            Group {i + 1}
          </h3>
          <ul className={`mt-1 flex flex-wrap ${tv ? 'gap-[1vh]' : 'gap-1.5'}`}>
            {members(view, g).map((p) => (
              <li key={p.id} className={`flex min-w-0 items-center gap-2 ${tv ? 'w-[calc(50%-0.5vh)]' : ''}`}>
                <Avatar name={p.name} photo={p.photo} size={tv ? 56 : 28} />
                <span className={`truncate font-semibold text-bone ${tv ? 'text-[clamp(1rem,3vh,1.6rem)]' : 'text-sm'}`}>{p.name}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
