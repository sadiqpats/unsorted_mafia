import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { suggestDistribution } from '../../shared/distribution';
import { ROLES, ROLE_ORDER } from '../../shared/roles';
import { MAX_PLAYERS, MIN_PLAYERS, defaultSettings } from '../../shared/settings';
import { RoleDetails } from '../components/RoleCard';
import { Section, Shell } from '../components/ui';

const s = { ...defaultSettings(10), roles: {} } as never;

const Step = ({ n, title, children }: { n: number; title: string; children: ReactNode }) => (
  <li className="flex gap-4">
    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-gold/60 font-[family-name:var(--font-display)] text-gold">{n}</span>
    <div>
      <h3 className="font-semibold text-bone">{title}</h3>
      <div className="mt-1 text-sm text-mute">{children}</div>
    </div>
  </li>
);

export default function Guide() {
  return (
    <Shell>
      <div className="space-y-5">
        <header className="py-4 text-center">
          <p className="eyebrow">The guide</p>
          <h1 className="brand-title mt-2 text-4xl font-black sm:text-5xl">How to play Mafia Night</h1>
          <p className="mt-3 text-mute">From zero to your first night in about five minutes.</p>
          <nav className="mt-5 flex flex-wrap justify-center gap-2 text-sm" aria-label="Guide sections">
            {[
              ['#host', 'Hosting'],
              ['#players', 'Joining'],
              ['#round', 'A round'],
              ['#fair', 'Fair play'],
              ['#roles', 'Characters'],
              ['#tables', 'Role tables'],
              ['#faq', 'Help'],
            ].map(([h, l]) => (
              <a key={h} href={h} className="chip !px-3 !py-1.5 hover:border-gold/60">
                {l}
              </a>
            ))}
          </nav>
        </header>

        <Section title="What you need">
          <ul className="grid gap-2 text-sm sm:grid-cols-2">
            <li>📱 One phone per player (any modern browser — no app, no account).</li>
            <li>🧑‍⚖️ One host device (phone, tablet or laptop). The host can also play.</li>
            <li>📶 Everyone online (Wi-Fi or mobile data).</li>
            <li>📺 Optional: a TV or projector for the public display.</li>
            <li>👥 5 to 26 players. 8–16 is the sweet spot.</li>
            <li>⏱ 20–45 minutes per game.</li>
          </ul>
        </Section>

        <Section title="Hosting a game" className="scroll-mt-20" aside={<Link className="btn btn-primary !min-h-9 !py-1 text-sm" to="/host">Host now</Link>}>
          <ol id="host" className="space-y-4">
            <Step n={1} title="Create the room">
              Tap <b>Host a Game</b>, enter the <b>host code</b> (only Unsorted Plans hosts have it — guests never need it), your name and how many people are playing (any number from 5 to 26). Decide whether you are <b>playing</b> or just running the
              game as <b>Game Master</b>.
            </Step>
            <Step n={2} title="Let people in">
              Show the <b>QR code</b> or read out the 5-letter <b>room code</b>. Players open the link on their own phones. You can also open the <b>TV display</b> and put the QR
              on the big screen.
            </Step>
            <Step n={3} title="Pick the characters">
              The app suggests a balanced mix for your player count. Adjust with the − / + buttons. The counter must match the number of players exactly. Red warnings block
              the start; gold ones are just advice.
            </Step>
            <Step n={4} title="Set the house rules (optional)">
              Defaults work well for a first game. Popular tweaks: shorter discussion for big groups, <i>Runoff vote</i> on ties, or <i>Host presses Next</i> if you want to
              narrate.
            </Step>
            <Step n={5} title="Start">
              When everyone shows ✓ Ready, tap <b>Start the game</b>. If a player didn’t join, tap “Start with the N players here” — roles are re-dealt to fit.
            </Step>
            <Step n={6} title="Put the photo wall on the TV">
              Tap <b>Open TV display</b> and put it on a TV or projector. Everyone’s face appears as they join; when someone is eliminated, their photo is cut. You can
              remove any inappropriate photo from the lobby.
            </Step>
            <Step n={7} title="Run the table">
              Timers move the game along on their own. Use <b>Pause</b> for breaks, <b>+30s</b> when the debate is good, and <b>Next phase</b> to skip ahead. Mistakes can be
              fixed with <b>Eliminate / Restore</b> — every correction is announced publicly, so nothing is ever changed in secret.
            </Step>
          </ol>
          <p className="mt-4 rounded-xl border border-gold/30 bg-gold/5 p-3 text-sm">
            <b>Game Master or player?</b> A Game Master sees every role (hidden behind a “Show roles” button). If you play, the dashboard shows <b>no secrets at all</b> and
            the app does all the narrating — perfect for small groups.
          </p>
        </Section>

        <Section title="Joining as a player">
          <ol id="players" className="space-y-4">
            <Step n={1} title="Scan or type the code">Open the camera on the QR code, or go to the site and tap Join a Game.</Step>
            <Step n={2} title="Pick a name and a photo">
              Use a name people at the table will recognise (names must be unique). Optionally tap <b>Take a selfie</b> or <b>Choose photo</b> — your face goes up on the
              TV wall, and if you’re eliminated your photo gets cut in two.
            </Step>
            <Step n={3} title="Tap “I’m ready”">Then wait. Keep the page open — if it closes, reopen the same link and you’re back in your seat.</Step>
            <Step n={4} title="See your role in private">
              When the game starts, turn away from the table and <b>press and hold</b> the card. Release and it hides again. Tap <b>I’ve seen my role</b>.
            </Step>
          </ol>
        </Section>

        <Section title="A round, step by step">
          <ol id="round" className="space-y-3 text-sm">
            <li>
              <b className="text-gold">⏱ No timers.</b> Each phase ends as soon as everyone has acted. The host can press <b>Next phase</b> if someone has
              stepped away, or switch timers on in the house rules.
            </li>
            <li>
              <b className="text-gold">🕯 Dawn.</b> (Only when a Thief or Imposter is in the game.) Everyone opens their panel and makes a choice. The Thief picks a{' '}
              <i>power</i> (never a person) to use for this round. From round 2 the Imposter may bring a dead player back. Every phone is told what happened, never who did it.
            </li>
            <li>
              <b className="text-gold">🌙 Night.</b> Everyone locks in a choice. The Mafia pick a victim; the Doctor protects (themselves too, but not two rounds in a row);
              the Detective investigates; the Godfather silences someone. Everyone else presses the dummy button, so the whole table is tapping at once.
            </li>
            <li>
              <b className="text-gold">☀ Day.</b> The night’s news appears, then you talk and vote in secret. The Day ends when everyone has voted. Most votes is out (the
              Judge counts double). Roles are never revealed until the game is over.
            </li>
          </ol>
          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3">
            <p className="rounded-xl border border-good/40 p-3">
              <b className="text-good">⛨ Town wins</b> when every Mafia member is gone (the Godfather doesn’t count).
            </p>
            <p className="rounded-xl border border-crimson/50 p-3">
              <b className="text-ember">🗡 Mafia wins</b> when the Mafia + Godfather equal or outnumber everyone else.
            </p>
            <p className="rounded-xl border border-neutral/40 p-3">
              <b className="text-neutral">◆ Neutrals</b> win their own way: Joker by being voted out; Thief & Imposter by surviving.
            </p>
          </div>
        </Section>

        <Section title="Fair play — how cheating is prevented">
          <div id="fair" className="grid gap-4 text-sm md:grid-cols-2">
            <div>
              <h3 className="mb-2 font-semibold text-gold">What the app does</h3>
              <ul className="space-y-2 text-bone/90">
                <li>🕯️ <b>Everyone acts every night.</b> Villagers pick a suspect, so you can’t spot a power by watching who taps.</li>
                <li>🛡️ <b>Identical screens.</b> Every closed panel looks the same; colours and sounds never depend on your role.</li>
                <li>🂠 <b>Hold-to-reveal.</b> Your card hides the moment you let go, lock the phone, or switch apps.</li>
                <li>⏳ <b>Auto-hiding panels.</b> Secret panels close themselves after 15 seconds.</li>
                <li>🔒 <b>Server-side secrets.</b> Your phone only ever receives your own role — not even the page code contains anyone else’s.</li>
                <li>🎲 <b>Fair dealing.</b> Roles are shuffled on the server with a cryptographic random generator. No rerolls.</li>
                <li>🗳️ <b>Secret ballots.</b> Votes stay hidden until voting closes. One vote per seat, enforced by the server.</li>
                <li>📵 <b>One seat, one phone.</b> A seat moves to a new phone only with a one-time code from the host, and the old phone is logged out.</li>
                <li>👻 <b>Quiet ghosts.</b> By default dead players can’t see other roles, so they can’t give anything away with a face.</li>
              </ul>
            </div>
            <div>
              <h3 className="mb-2 font-semibold text-gold">Table rules (read these out)</h3>
              <ol className="list-decimal space-y-2 pl-5 text-bone/90">
                <li>Never show your screen to anyone — not even “just a peek”.</li>
                <li>At night, everyone looks down at their own phone. Brightness down; sit back from your neighbours.</li>
                <li>Take your time at night — rushing or lingering is a tell. Lock in, then put the phone face down.</li>
                <li>No photos or screenshots of your role.</li>
                <li>Dead and silenced players stay quiet.</li>
                <li>Talking is the game: you may claim anything — but prove nothing with your screen.</li>
                <li>The host’s laptop is off-limits. GM: keep roles hidden unless you need them.</li>
              </ol>
              <p className="mt-3 rounded-lg border border-line/60 bg-black/30 p-3 text-xs text-mute">
                Tip: Turn on <b>Low-light mode</b> (🔊 Settings) in a dark room so screens don’t glow, and keep sounds on — they play identically on every phone.
              </p>
            </div>
          </div>
        </Section>

        <section id="roles" className="scroll-mt-20">
          <h2 className="divider-ornament my-6 font-[family-name:var(--font-display)] text-xs tracking-[0.3em]">THE CHARACTERS</h2>
          <div className="grid gap-4 md:grid-cols-2">
            {ROLE_ORDER.map((id) => (
              <article key={id} className="card p-5">
                <RoleDetails roleId={id} alignment={ROLES[id].alignment(s)} />
              </article>
            ))}
          </div>
        </section>

        <Section title="Suggested role mix by player count">
          <div id="tables" className="overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[640px] text-center text-xs">
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
                {Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => i + MIN_PLAYERS).map((n) => {
                  const d = suggestDistribution(n);
                  return (
                    <tr key={n} className="border-t border-line/40">
                      <td className="p-1.5 text-left font-semibold text-gold">{n}</td>
                      {ROLE_ORDER.map((id) => (
                        <td key={id} className={`p-1.5 tabular-nums ${d[id] ? '' : 'text-ash'}`}>
                          {d[id] || '·'}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-mute">Mafia team ≈ 28% of the table (one is the Godfather once there are two). The host can change every number.</p>
        </Section>

        <Section title="Help & troubleshooting">
          <dl id="faq" className="space-y-4 text-sm">
            {[
              ['My phone locked / I closed the tab.', 'Just reopen the link (or scan the QR again). Your seat is remembered on this phone and you return with the same role.'],
              ['I switched phones or cleared my browser.', 'Ask the host to tap “Rejoin” next to your name. Enter the one-time code on the join page under “Rejoin”.'],
              ['Someone disconnected in the middle of the night.', 'The game never waits forever — when the timer runs out, the night resolves without them (their action is skipped).'],
              ['We made a mistake.', 'The host can Eliminate or Restore any player. Corrections are announced publicly and stay in the log.'],
              ['The vote tied.', 'Depends on the house rule: nobody is eliminated (default), a runoff vote between the tied players, or the host decides.'],
              ['The host’s phone died.', 'The game keeps running on its timers. The host reopens the same link on the same device to get the controls back.'],
              ['Can I see who voted for whom?', 'Only if the host chose “Who voted for whom” for vote reveals. By default you see the totals only.'],
            ].map(([q, a]) => (
              <div key={q}>
                <dt className="font-semibold text-bone">{q}</dt>
                <dd className="mt-1 text-mute">{a}</dd>
              </div>
            ))}
          </dl>
        </Section>

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
