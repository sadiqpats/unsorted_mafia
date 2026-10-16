import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { suggestDistribution } from '../../shared/distribution';
import { ROLES, ROLE_ORDER } from '../../shared/roles';
import { MAX_PLAYERS, MIN_PLAYERS, defaultSettings } from '../../shared/settings';
import type { Alignment } from '../../shared/types';
import { GuideArt } from '../components/GuideArt';
import { RoleArt } from '../components/RoleArt';
import { RoleDetails } from '../components/RoleCard';
import { AlignmentBadge, Modal, Shell } from '../components/ui';

const s = { ...defaultSettings(10), roles: {} } as never;
const sideOf = (id: string) => ROLES[id].alignment(s) as Alignment;

/** One short line per character; tapping the card opens the full details. */
const ONE_LINER: Record<string, string> = {
  mafia: 'Each night, pick a victim with your team.',
  godfather: 'Knows the Mafia. Silences one player each night.',
  detective: 'Each night, check one player: suspicious or not.',
  doctor: 'Each night, save one player. Yourself too, not twice in a row.',
  judge: 'Your Day vote counts double.',
  villager: 'No power. Talk, spot the liars, vote.',
  thief: 'Each Dawn, steal a power (not a person) for the round.',
  imposter: 'From round 2, bring a dead player back at Dawn.',
  jester: 'Get voted out by Day and you win alone.',
};

/** A guide section. It fades in as it scrolls into view where the browser supports scroll-driven animation (CSS only, never hidden otherwise). */
function Reveal({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`reveal-on scroll-mt-20 ${className}`}>
      {children}
    </section>
  );
}

const Heading = ({ eyebrow, title }: { eyebrow: string; title: string }) => (
  <div className="mb-4 text-center">
    <p className="eyebrow">{eyebrow}</p>
    <h2 className="brand-title mt-1 text-2xl font-bold sm:text-3xl">{title}</h2>
  </div>
);

const Tile = ({ scene, title, text }: { scene: string; title: string; text?: ReactNode }) => (
  <div className="guide-tile card flex flex-col items-center p-3 text-center">
    <GuideArt scene={scene} className="h-20 w-auto" />
    <h3 className="mt-1 font-semibold text-bone">{title}</h3>
    {text && <p className="mt-0.5 text-xs leading-snug text-mute">{text}</p>}
  </div>
);

const StepCard = ({ n, scene, title, children }: { n: number; scene: string; title: string; children: ReactNode }) => (
  <li className="guide-tile card relative flex items-center gap-3 p-3 sm:flex-col sm:p-4 sm:text-center">
    <span className="absolute left-2 top-2 grid h-6 w-6 place-items-center rounded-full border border-gold/60 bg-ink font-[family-name:var(--font-display)] text-xs text-gold">{n}</span>
    <GuideArt scene={scene} className="h-20 w-28 shrink-0 sm:h-24 sm:w-auto" />
    <div>
      <h3 className="font-semibold text-bone">{title}</h3>
      <p className="mt-0.5 text-sm leading-snug text-mute">{children}</p>
    </div>
  </li>
);

const Medal = ({ icon, title, text }: { icon: string; title: string; text: string }) => (
  <li className="guide-tile flex items-start gap-3 rounded-xl border border-line/60 bg-black/25 p-3">
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-gold/40 bg-gold/5 text-lg" aria-hidden="true">
      {icon}
    </span>
    <div className="text-sm leading-snug">
      <b className="text-bone">{title}</b>
      <span className="block text-mute">{text}</span>
    </div>
  </li>
);

const PHASES = [
  {
    scene: 'dawn',
    name: 'Dawn',
    note: 'Only with a Thief or Imposter',
    points: [
      ['🎭', 'Thief steals a power for the round'],
      ['⚰️', 'Imposter may revive someone (from round 2)'],
      ['👆', 'Everyone else taps the dummy button'],
    ],
  },
  {
    scene: 'night',
    name: 'Night',
    note: 'Heads down, phones up',
    points: [
      ['🎩', 'Mafia choose a victim'],
      ['💉', 'Doctor saves · Detective checks'],
      ['🤫', 'Godfather silences someone'],
    ],
  },
  {
    scene: 'day',
    name: 'Day',
    note: 'Talk it out, then vote',
    points: [
      ['📰', 'News: who died, who was silenced'],
      ['🗣️', 'Debate. Bluff. Accuse.'],
      ['🗳️', 'Secret vote: most votes is out'],
    ],
  },
] as const;

const HELP: [string, string][] = [
  ['My phone locked or I closed the tab', 'Reopen the link or scan the QR again. Your seat and role come back.'],
  ['I switched phones', 'The host taps Rejoin code next to your name. Type it on the Join page under “Rejoin”.'],
  ['Someone left in the middle of a phase', 'The host presses Next phase. Their action is skipped and their vote doesn’t count.'],
  ['We made a mistake', 'The host can Eliminate or Restore anyone. It’s always announced, never secret.'],
  ['The vote tied', 'Nobody goes out (default). The host can switch to a runoff vote or decide themselves.'],
  ['The host’s phone died', 'The game keeps going. The host reopens the same link on the same device.'],
  ['Can we see who voted for whom?', 'Only if the host turns that on. By default you see vote totals.'],
  ['Can we play with timers?', 'Yes, it’s a house rule. Then the host also gets Pause and +30s.'],
];

function RoleMix() {
  const [n, setN] = useState(10);
  const d = suggestDistribution(n);
  return (
    <div className="card p-4">
      <label className="flex items-center justify-between gap-3 text-sm" htmlFor="mix-count">
        <span className="text-mute">Players</span>
        <span className="brand-title text-3xl font-black tabular-nums">{n}</span>
      </label>
      <input id="mix-count" type="range" min={MIN_PLAYERS} max={MAX_PLAYERS} value={n} onChange={(e) => setN(Number(e.target.value))} className="guide-range mt-2 w-full" />
      <ul className="mt-4 flex flex-wrap justify-center gap-3" aria-live="polite">
        {ROLE_ORDER.filter((id) => d[id]).map((id) => (
          <li key={`${id}-${d[id]}`} className="anim-pop flex flex-col items-center">
            <div className="relative">
              <RoleArt art={ROLES[id].art} alignment={sideOf(id)} size={52} />
              <span className="absolute -right-1 -top-1 grid h-6 min-w-6 place-items-center rounded-full bg-crimson px-1 text-xs font-bold text-bone">×{d[id]}</span>
            </div>
            <span className="mt-1 text-[0.7rem] text-mute">{ROLES[id].name}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-center text-xs text-mute">A suggestion: the host can change every number. 8–16 players is the sweet spot.</p>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-center text-gold">Show the full table</summary>
        <div className="mt-2 overflow-x-auto scrollbar-thin">
          <table className="w-full min-w-[600px] text-center">
            <thead>
              <tr className="text-mute">
                <th className="p-1.5 text-left">Players</th>
                {ROLE_ORDER.map((id) => (
                  <th key={id} className="p-1.5 font-medium">
                    {ROLES[id].name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((k) => {
                const row = suggestDistribution(k);
                return (
                  <tr key={k} className={`border-t border-line/40 ${k === n ? 'bg-gold/10' : ''}`}>
                    <td className="p-1.5 text-left font-semibold text-gold">{k}</td>
                    {ROLE_ORDER.map((id) => (
                      <td key={id} className={`p-1.5 tabular-nums ${row[id] ? '' : 'text-ash'}`}>
                        {row[id] || '·'}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export default function Guide() {
  const [role, setRole] = useState<string | null>(null);
  return (
    <Shell>
      <div className="space-y-12">
        {/* ---------------------------------------------------------- hero */}
        <header className="pt-4 text-center">
          <p className="eyebrow">The guide</p>
          <h1 className="brand-title mt-2 text-4xl font-black sm:text-5xl">How to play Mafia Night</h1>
          <p className="mt-3 text-mute">Five minutes. Mostly pictures.</p>
          <nav className="mt-5 flex flex-wrap justify-center gap-2 text-sm" aria-label="Guide sections">
            {[
              ['#need', '🎒 Need'],
              ['#setup', '🚪 Setup'],
              ['#round', '🌙 A round'],
              ['#win', '🏆 Winning'],
              ['#roles', '🃏 Characters'],
              ['#fair', '🔒 Fair play'],
              ['#mix', '🎚️ Role mix'],
              ['#faq', '❓ Help'],
            ].map(([h, l]) => (
              <a key={h} href={h} className="chip !px-3 !py-1.5 hover:border-gold/60">
                {l}
              </a>
            ))}
          </nav>
        </header>

        {/* ---------------------------------------------------------- what you need */}
        <Reveal id="need">
          <Heading eyebrow="Before you start" title="What you need" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Tile scene="phone" title="A phone each" text="Any browser. No app, no account." />
            <Tile scene="host" title="One host" text="Phone, tablet or laptop. Can also play." />
            <Tile scene="crowd" title="5–26 players" text="8–16 is the sweet spot." />
            <Tile scene="clock" title="20–45 min" text="No timers. Nobody is rushed." />
            <div className="col-span-2 sm:col-span-1">
              <Tile scene="tv" title="A TV (optional)" text="Shows everyone’s photo. Eliminated? Your photo gets cut." />
            </div>
          </div>
          <p className="mt-3 text-center text-xs text-mute">📶 Everyone online: Wi-Fi or mobile data.</p>
        </Reveal>

        {/* ---------------------------------------------------------- setup */}
        <Reveal id="setup">
          <Heading eyebrow="Two minutes" title="Setting up" />
          <h3 className="mb-2 text-center text-sm font-semibold text-gold">👑 The host</h3>
          <ol className="grid gap-3 sm:grid-cols-3">
            <StepCard n={1} scene="createRoom" title="Open a room">
              Tap <b>Host a Game</b>. Enter the <b>host code</b> (hosts only), your name and the player count.
            </StepCard>
            <StepCard n={2} scene="pickRoles" title="Pick characters">
              A fair mix is suggested. Tweak with − / +. The total must match the players.
            </StepCard>
            <StepCard n={3} scene="tv" title="Start">
              When all show ✓ Ready, tap <b>Start</b>. Put the <b>TV display</b> on a big screen.
            </StepCard>
          </ol>
          <h3 className="mb-2 mt-6 text-center text-sm font-semibold text-gold">📱 Everyone else</h3>
          <ol className="grid gap-3 sm:grid-cols-3">
            <StepCard n={1} scene="scan" title="Scan to join">
              Scan the QR or type the 5-letter room code on <b>Join a Game</b>.
            </StepCard>
            <StepCard n={2} scene="selfie" title="Name + selfie">
              A name the table knows. Photo is optional and goes on the TV.
            </StepCard>
            <StepCard n={3} scene="holdReveal" title="Hold to see your role">
              Turn away, <b>press and hold</b> the card. Let go and it hides.
            </StepCard>
          </ol>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <p className="rounded-xl border border-gold/30 bg-gold/5 p-3">
              <b className="text-gold">🎙️ Game Master</b>: runs the game without playing. Can peek at all roles behind a <i>Show roles</i> button.
            </p>
            <p className="rounded-xl border border-gold/30 bg-gold/5 p-3">
              <b className="text-gold">🎲 Host who plays</b>: gets a secret role too. The host screen shows <b>no secrets</b>; the app narrates.
            </p>
          </div>
        </Reveal>

        {/* ---------------------------------------------------------- round */}
        <Reveal id="round">
          <Heading eyebrow="Repeat until someone wins" title="One round" />
          <ol className="grid gap-3 sm:grid-cols-3">
            {PHASES.map((p, i) => (
              <li key={p.name} className="guide-tile card relative p-4">
                <div className="flex items-center gap-3 sm:flex-col sm:text-center">
                  <GuideArt scene={p.scene} className="h-20 w-28 shrink-0 sm:h-24 sm:w-auto" />
                  <div>
                    <h3 className="brand-title text-2xl font-bold">{p.name}</h3>
                    <p className="text-xs text-mute">{p.note}</p>
                  </div>
                </div>
                <ul className="mt-3 space-y-1.5 text-sm">
                  {p.points.map(([icon, text]) => (
                    <li key={text} className="flex gap-2">
                      <span aria-hidden="true">{icon}</span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ul>
                {i < PHASES.length - 1 && (
                  <span className="absolute -bottom-3 left-1/2 z-10 grid h-6 w-6 -translate-x-1/2 place-items-center rounded-full border border-gold/50 bg-ink text-xs text-gold sm:-right-3 sm:bottom-auto sm:left-auto sm:top-1/2 sm:-translate-y-1/2 sm:translate-x-0" aria-hidden="true">
                    <span className="sm:hidden">↓</span>
                    <span className="hidden sm:inline">→</span>
                  </span>
                )}
              </li>
            ))}
          </ol>
          <ul className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <Medal icon="✅" title="No timers" text="Each phase ends when everyone has tapped. The host can always press Next phase." />
            <Medal icon="👆" title="Everyone taps, every time" text="People without a power press the dummy button, so nobody gives themselves away." />
            <Medal icon="🤫" title="Silenced?" text="Don’t speak today, but you can still vote." />
            <Medal icon="🎭" title="Roles stay secret" text="Deaths are announced by name only. All roles are revealed at game over." />
          </ul>
        </Reveal>

        {/* ---------------------------------------------------------- winning */}
        <Reveal id="win">
          <Heading eyebrow="The end" title="Who wins?" />
          <div className="grid gap-3 sm:grid-cols-3">
            {(
              [
                ['cottage', 'good', 'Town', 'Every Mafia member is dead. (The Godfather doesn’t count.)', 'border-good/40'],
                ['fedora', 'mafia', 'Mafia', 'Mafia + Godfather equal or outnumber everyone else.', 'border-crimson/50'],
                ['joker', 'neutral', 'Neutrals', 'Joker: get voted out. Thief & Imposter: just survive.', 'border-neutral/40'],
              ] as const
            ).map(([art, side, title, text, border]) => (
              <div key={title} className={`guide-tile card flex items-center gap-3 border p-4 sm:flex-col sm:text-center ${border}`}>
                <RoleArt art={art} alignment={side} size={64} className="shrink-0" />
                <div>
                  <h3 className="brand-title text-xl font-bold">{title} wins</h3>
                  <p className="mt-0.5 text-sm text-mute">{text}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-mute">Nobody left alive is a draw. A surviving Thief or Imposter wins alongside whoever won.</p>
        </Reveal>

        {/* ---------------------------------------------------------- characters */}
        <Reveal id="roles">
          <Heading eyebrow="Tap a card for details" title="The characters" />
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 [&>li:last-child:nth-child(odd)]:col-span-2 sm:[&>li:last-child:nth-child(odd)]:col-span-1">
            {ROLE_ORDER.map((id) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => setRole(id)}
                  className="guide-tile card flex h-full w-full flex-col items-center p-3 text-center focus-ring"
                  aria-label={`${ROLES[id].name}: more details`}
                >
                  <RoleArt art={ROLES[id].art} alignment={sideOf(id)} size={72} />
                  <span className="brand-title mt-2 text-lg font-bold">{ROLES[id].name}</span>
                  <span className="mt-1 scale-90">
                    <AlignmentBadge alignment={sideOf(id)} />
                  </span>
                  <span className="mt-2 text-xs leading-snug text-mute">{ONE_LINER[id]}</span>
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-center text-xs text-mute">The Thief’s and Imposter’s fine print is in their cards. Priest and Bodyguard are retired.</p>
        </Reveal>

        <Modal open={!!role} onClose={() => setRole(null)} title={role ? ROLES[role].name : ''}>
          {role && (
            <div className="max-h-[70dvh] overflow-y-auto scrollbar-thin pr-1">
              <RoleDetails roleId={role} alignment={sideOf(role)} />
            </div>
          )}
          <button className="btn btn-ghost mt-3 w-full" onClick={() => setRole(null)}>
            Close
          </button>
        </Modal>

        {/* ---------------------------------------------------------- fair play */}
        <Reveal id="fair">
          <Heading eyebrow="No peeking" title="Fair play" />
          <div className="grid gap-4 md:grid-cols-2">
            <div className="card p-4">
              <h3 className="mb-3 text-center text-sm font-semibold text-gold">🛡️ The app keeps secrets</h3>
              <ul className="grid gap-2">
                <Medal icon="🃏" title="Hold to reveal" text="Card hides when you let go, lock or switch apps." />
                <Medal icon="⏳" title="Self-closing panels" text="Secret panels shut after 15 seconds." />
                <Medal icon="🪞" title="Identical screens" text="Same look and sounds for every role." />
                <Medal icon="🔒" title="Secrets on the server" text="Your phone only ever gets your own role." />
                <Medal icon="🎲" title="Fair shuffle" text="Cryptographic dealing. No rerolls." />
                <Medal icon="🗳️" title="Secret ballot" text="One vote per seat, hidden until the vote closes." />
                <Medal icon="📵" title="One seat, one phone" text="Moving phones needs a one-time code from the host." />
                <Medal icon="👻" title="Quiet ghosts" text="Dead players can’t see other roles." />
              </ul>
            </div>
            <div className="card p-4">
              <h3 className="mb-3 text-center text-sm font-semibold text-gold">📣 Table rules (read them out)</h3>
              <ol className="grid gap-2">
                <Medal icon="🙈" title="Never show your screen" text="Not even “just a peek”." />
                <Medal icon="🔅" title="Heads down at night" text="Brightness low, sit back from your neighbours." />
                <Medal icon="🐢" title="Take your time" text="Rushing is a tell. Lock in, then phone face down." />
                <Medal icon="📸" title="No screenshots" text="Of your role, ever." />
                <Medal icon="🤐" title="Dead and silenced stay quiet" text="Silenced players may still vote." />
                <Medal icon="💬" title="Claim anything" text="But prove nothing with your screen." />
                <Medal icon="💻" title="Host device is off-limits" text="GM: keep roles hidden unless needed." />
              </ol>
              <p className="mt-3 rounded-lg border border-line/60 bg-black/30 p-3 text-xs text-mute">
                🌑 Dark room? Turn on <b>Low-light mode</b> in the 🔊 settings. Keep sound on: it plays the same on every phone.
              </p>
            </div>
          </div>
        </Reveal>

        {/* ---------------------------------------------------------- role mix */}
        <Reveal id="mix">
          <Heading eyebrow="Slide to your group size" title="Suggested role mix" />
          <RoleMix />
        </Reveal>

        {/* ---------------------------------------------------------- help */}
        <Reveal id="faq">
          <Heading eyebrow="Something went wrong?" title="Quick help" />
          <div className="space-y-2">
            {HELP.map(([q, a]) => (
              <details key={q} className="group card px-4 py-3 text-sm">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 font-semibold text-bone">
                  {q}
                  <span className="text-gold transition-transform group-open:rotate-45" aria-hidden="true">
                    +
                  </span>
                </summary>
                <p className="mt-2 text-mute">{a}</p>
              </details>
            ))}
          </div>
        </Reveal>

        <div className="flex flex-col gap-3 pb-4 sm:flex-row">
          <Link to="/host" className="btn btn-primary flex-1">
            Host a Game
          </Link>
          <Link to="/join" className="btn btn-ghost flex-1">
            Join a Game
          </Link>
        </div>
      </div>
    </Shell>
  );
}
