import { Link } from 'react-router-dom';
import { ROLES, ROLE_ORDER } from '../../shared/roles';
import { defaultSettings } from '../../shared/settings';
import { RoleArt } from '../components/RoleArt';
import { AlignmentBadge, BrandMark, LOGO, PrefsMenu } from '../components/ui';

const settings = { ...defaultSettings(10), roles: {} };

export default function Landing() {
  return (
    <div className="grain vignette min-h-dvh overflow-x-hidden">
      <header className="relative z-40 mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <BrandMark />
        <nav className="flex items-center gap-2 text-sm">
          <Link to="/guide" className="btn btn-ghost !min-h-10 !px-3 !py-1.5">
            Guide
          </Link>
          <PrefsMenu />
        </nav>
      </header>

      <main className="relative z-10">
        {/* HERO */}
        <section className="mx-auto flex max-w-6xl flex-col items-center px-4 pb-20 pt-10 text-center md:pt-20">
          <img src={LOGO.wordmark} alt="Unsorted" className="anim-fade-up h-auto w-56 sm:w-72" />
          <p className="eyebrow anim-fade-up mt-3">presents</p>
          <h1 className="brand-title anim-fade-up mt-4 text-5xl font-black leading-[0.95] sm:text-7xl md:text-8xl" style={{ animationDelay: '0.1s' }}>
            Mafia
            <br />
            Night
          </h1>
          <p className="anim-fade-up mt-6 font-[family-name:var(--font-serif)] text-2xl italic text-mute md:text-3xl" style={{ animationDelay: '0.2s' }}>
            Plans worth showing up for.
          </p>
          <p className="anim-fade-up mt-6 max-w-xl text-bone/80" style={{ animationDelay: '0.3s' }}>
            A room full of friends. A handful of secret killers. Everyone plays on their own phone — the server deals the roles, runs the night, counts the
            votes, and keeps every secret. Nobody has to sit out as narrator.
          </p>
          <div className="anim-fade-up mt-10 flex w-full max-w-md flex-col gap-3 sm:flex-row" style={{ animationDelay: '0.4s' }}>
            <Link to="/host" className="btn btn-primary flex-1 text-lg">
              Host a Game
            </Link>
            <Link to="/join" className="btn btn-ghost flex-1 text-lg">
              Join a Game
            </Link>
          </div>
          <p className="mt-4 text-sm text-mute">
            First time? Read the <Link to="/guide" className="text-gold underline underline-offset-4">5-minute guide</Link>.
          </p>
        </section>

        {/* HOW IT WORKS */}
        <section className="mx-auto max-w-6xl px-4 pb-20">
          <div className="divider-ornament mb-10 font-[family-name:var(--font-display)] text-xs tracking-[0.3em]">HOW IT WORKS</div>
          <ol className="grid gap-4 md:grid-cols-4">
            {[
              ['I', 'Open a room', 'The host picks the player count (5–26) and the characters. A QR code and room code appear.'],
              ['II', 'Everyone joins', 'Players scan the QR or type the code on their own phone, enter a name and tap Ready.'],
              ['III', 'Secret roles', 'Each phone privately shows one role. Press and hold to peek; release to hide.'],
              ['IV', 'Night & day', 'At night everyone taps a choice in secret. By day, argue, accuse and vote someone out.'],
            ].map(([n, t, d]) => (
              <li key={n} className="card p-5">
                <div className="font-[family-name:var(--font-display)] text-3xl text-crimson">{n}</div>
                <h3 className="mt-2 font-[family-name:var(--font-display)] text-lg tracking-wide text-gold">{t}</h3>
                <p className="mt-2 text-sm text-mute">{d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* CHARACTERS */}
        <section className="mx-auto max-w-6xl px-4 pb-20" aria-labelledby="chars">
          <div className="divider-ornament mb-3 font-[family-name:var(--font-display)] text-xs tracking-[0.3em]">
            <span id="chars">THE CHARACTERS</span>
          </div>
          <p className="mb-10 text-center text-sm text-mute">Not every character appears in every game — the host chooses who is at the table.</p>
          <div className="grid grid-cols-2 gap-3 md:gap-4 lg:grid-cols-5">
            {ROLE_ORDER.map((id) => {
              const r = ROLES[id];
              const a = r.alignment(settings as never);
              return (
                <article key={id} className="card group flex flex-col items-center p-3 text-center sm:p-5 transition hover:-translate-y-1 hover:border-gold/50">
                  <RoleArt art={r.art} alignment={a} size={72} />
                  <h3 className="mt-3 font-[family-name:var(--font-display)] text-lg text-bone">{r.name}</h3>
                  <div className="mt-1.5">
                    <AlignmentBadge alignment={a} />
                  </div>
                  <p className="mt-3 text-xs text-mute sm:text-sm">{r.abilityText}</p>
                </article>
              );
            })}
          </div>
        </section>

        {/* RULES */}
        <section className="mx-auto grid max-w-6xl gap-4 px-4 pb-20 md:grid-cols-2">
          <div className="card p-6">
            <h2 className="eyebrow mb-4">The short rules</h2>
            <ul className="space-y-3 text-sm text-bone/90">
              <li>
                <b className="text-gold">Town (Good)</b> wins when every Mafia member is eliminated.
              </li>
              <li>
                <b className="text-ember">Mafia</b> wins when they equal or outnumber everyone else alive.
              </li>
              <li>
                <b className="text-neutral">Neutrals</b> have their own goals — the Jester wants to be voted out; the Thief and Imposter want to survive.
              </li>
              <li>Each night the Mafia pick a victim, while other roles protect, investigate, steal or revive — all in secret.</li>
              <li>Each day the town discusses, then votes. Most votes is eliminated. The Judge’s vote counts double.</li>
              <li>Dead players stay silent. Silenced players can’t speak or vote that day.</li>
            </ul>
          </div>
          <div className="card p-6">
            <h2 className="eyebrow mb-4">Built for the same room</h2>
            <ul className="space-y-3 text-sm text-bone/90">
              <li>🕯️ Everyone taps a choice every night — even players without a power — so no one can tell who has a role by watching hands.</li>
              <li>🂠 Your role hides behind a press-and-hold card, and every secret panel closes itself when you look away.</li>
              <li>🔒 Roles are dealt by the server with a secure random generator. Phones only ever receive their own secrets.</li>
              <li>🗳️ Votes stay hidden until the timer ends. Each seat is locked to one phone.</li>
            </ul>
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-line/50 py-8 text-center text-xs text-mute">
        <img src={LOGO.full} alt="Unsorted — Plans worth showing up for." className="mx-auto h-auto w-60 opacity-90" />
      </footer>
    </div>
  );
}
