import { Link } from 'react-router-dom';
import { Clapper } from '../charades/art';
import { RoleArt } from '../components/RoleArt';
import { BrandMark, LOGO, PrefsMenu, useTitle } from '../components/ui';

/** The front door of Unsorted: pick tonight's game. */
export default function Hub() {
  useTitle('Unsorted');
  return (
    <div className="grain vignette min-h-dvh overflow-x-hidden">
      <header className="relative z-40 mx-auto flex h-16 max-w-5xl items-center justify-between px-4">
        <BrandMark label={null} to="/" />
        <PrefsMenu />
      </header>

      <main className="relative z-10 mx-auto max-w-5xl px-4 pb-16">
        <section className="flex flex-col items-center pt-6 text-center md:pt-12">
          <img src={LOGO.full} alt="Unsorted — Plans worth showing up for." className="anim-fade-up h-auto w-72 sm:w-96" />
          <p className="eyebrow anim-fade-up mt-8" style={{ animationDelay: '0.1s' }}>
            Game night
          </p>
          <h1 className="brand-title anim-fade-up mt-2 text-4xl font-black sm:text-5xl" style={{ animationDelay: '0.15s' }}>
            Pick tonight’s game
          </h1>
          <p className="anim-fade-up mt-3 max-w-md text-mute" style={{ animationDelay: '0.2s' }}>
            Party games for the same room. Everyone plays on their phones. No apps, no accounts.
          </p>
        </section>

        <section className="mt-10 grid gap-5 md:grid-cols-2">
          <Link
            to="/mafia"
            className="hub-card hub-mafia anim-fade-up group card relative flex flex-col items-center overflow-hidden p-6 text-center focus-ring"
            style={{ animationDelay: '0.25s' }}
          >
            <span className="hub-glow" aria-hidden="true" />
            <RoleArt art="fedora" alignment="mafia" size={110} className="relative transition-transform duration-500 group-hover:scale-105" />
            <h2 className="brand-title relative mt-4 text-4xl font-black">Mafia Night</h2>
            <p className="relative mt-2 font-[family-name:var(--font-serif)] text-xl italic text-mute">Trust no one. Not even your friends.</p>
            <ul className="relative mt-4 flex flex-wrap justify-center gap-2 text-xs">
              <li className="chip">👥 5–26 players</li>
              <li className="chip">🎭 Secret roles</li>
              <li className="chip">⏱ 20–45 min</li>
            </ul>
            <span className="btn btn-primary relative mt-6 w-full max-w-xs">Play Mafia Night</span>
          </Link>

          <Link
            to="/charades"
            className="hub-card hub-charades anim-fade-up group card relative flex flex-col items-center overflow-hidden p-6 text-center focus-ring"
            style={{ animationDelay: '0.35s' }}
          >
            <span className="hub-glow" aria-hidden="true" />
            <span className="hub-bulbs" aria-hidden="true" />
            <Clapper size={110} className="relative transition-transform duration-500 group-hover:-rotate-3 group-hover:scale-105" />
            <h2 className="charades-title relative mt-4 text-4xl">Bollywood Dumb Charades</h2>
            <p className="relative mt-2 text-lg text-[#ffd98a]">Act it out. No words. Full drama.</p>
            <ul className="relative mt-4 flex flex-wrap justify-center gap-2 text-xs">
              <li className="chip !border-[#ffb300]/50">🎬 970+ films</li>
              <li className="chip !border-[#ffb300]/50">⚔️ 2 teams</li>
              <li className="chip !border-[#ffb300]/50">📺 TV scoreboard</li>
            </ul>
            <span className="btn relative mt-6 w-full max-w-xs bg-gradient-to-b from-[#ff3d8b] to-[#c4105a] text-white shadow-[0_10px_30px_-10px_#e5196f]">Play Dumb Charades</span>
          </Link>
        </section>
      </main>

      <footer className="relative z-10 border-t border-line/50 py-6 text-center text-xs text-mute">Unsorted · Plans worth showing up for.</footer>
    </div>
  );
}
