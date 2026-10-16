import { Link } from 'react-router-dom';
import { Clapper, Reel } from '../art';
import { BollyShell } from '../ui';

const STEPS: [string, string, string][] = [
  ['👑', 'Host opens a room', 'Pick rounds, timer and how movies are chosen. Put the scoreboard on the TV.'],
  ['📱', 'Two captains join', 'One phone per team. Everyone else just plays — no phones needed.'],
  ['🃏', 'Flip a card', 'The captain sees the movie, shows the actor, and the clock starts.'],
  ['🤫', 'Act it out', 'No talking! The team shouts guesses. The host taps ✅ when someone nails it.'],
];

const SIGNS: [string, string][] = [
  ['🎥', 'Movie: crank an old film camera'],
  ['✋', 'Number of words: hold up fingers'],
  ['☝️', 'Which word: fingers again, then act it'],
  ['🤏', 'Short word (ka, ki, the): pinch fingers'],
  ['👂', 'Sounds like: tug your ear'],
  ['✂️', 'Syllables: tap fingers on your forearm'],
  ['🙅', 'No lip-syncing, no pointing at things that spell it'],
  ['🎵', 'Humming the song? Only if the host allows it!'],
];

export default function CharadesHome() {
  return (
    <BollyShell>
      <section className="flex flex-col items-center pt-4 text-center">
        <Clapper size={140} className="anim-fade-up" />
        <p className="eyebrow anim-fade-up mt-4" style={{ animationDelay: '0.05s' }}>
          Unsorted presents
        </p>
        <h1 className="charades-title anim-fade-up mt-2 text-5xl sm:text-6xl" style={{ animationDelay: '0.1s' }}>
          Bollywood Dumb Charades
        </h1>
        <p className="anim-fade-up mt-3 text-lg text-[#ffd98a]" style={{ animationDelay: '0.15s' }}>
          Act it out. No words. Full drama.
        </p>
        <p className="anim-fade-up mt-2 max-w-md text-sm text-white/70" style={{ animationDelay: '0.2s' }}>
          972 famous Hindi films from 2000 onwards — none longer than four words. Two teams, one TV, endless overacting.
        </p>
        <div className="anim-fade-up mt-7 flex w-full max-w-md flex-col gap-3 sm:flex-row" style={{ animationDelay: '0.25s' }}>
          <Link to="/charades/host" className="btn btn-bolly flex-1 text-lg">
            Host a game
          </Link>
          <Link to="/charades/join" className="btn btn-marigold flex-1 text-lg">
            Join as captain
          </Link>
        </div>
      </section>

      <section className="mt-12">
        <h2 className="charades-title text-center text-3xl">How it works</h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2">
          {STEPS.map(([icon, title, text], i) => (
            <li key={title} className="card anim-fade-up flex items-start gap-3 p-4" style={{ animationDelay: `${0.05 * i}s` }}>
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[#ffb300]/50 bg-[#ffb300]/10 text-2xl" aria-hidden="true">
                {icon}
              </span>
              <div>
                <h3 className="font-semibold text-white">
                  {i + 1}. {title}
                </h3>
                <p className="mt-0.5 text-sm text-white/70">{text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="mt-12 grid gap-4 md:grid-cols-2">
        <div className="card p-5">
          <h2 className="charades-title text-2xl">Scoring</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/85">
            <li>✅ Team guesses it before time runs out: <b className="text-[#ffd76a]">+1 point</b>.</li>
            <li>❌ Pass or time’s up: no point.</li>
            <li>🔁 Each round, both teams act once. Most points after the last round wins.</li>
            <li>🤝 A tie? Play one more round.</li>
            <li>🔀 Stuck with a tough one? Swap the card (limited swaps — the clock keeps ticking).</li>
          </ul>
        </div>
        <div className="card p-5">
          <h2 className="charades-title text-2xl">Who picks the movie?</h2>
          <ul className="mt-3 space-y-2 text-sm text-white/85">
            <li>
              <b className="text-[#ffd76a]">🃏 From the deck</b>: the acting captain flips a random card.
            </li>
            <li>
              <b className="text-[#ffd76a]">⚔️ The rival team</b>: the other captain types any movie. We check it’s a real Hindi film from 2000 or later with at most four words — or they send a random card.
            </li>
          </ul>
        </div>
      </section>

      <section className="mt-12">
        <div className="flex items-center justify-center gap-3">
          <Reel size={36} />
          <h2 className="charades-title text-3xl">The classic signs</h2>
          <Reel size={36} />
        </div>
        <ul className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-2">
          {SIGNS.map(([icon, text]) => (
            <li key={text} className="flex items-center gap-3 rounded-xl border border-[#ffb300]/20 bg-black/20 px-3 py-2.5 text-sm">
              <span className="text-xl" aria-hidden="true">
                {icon}
              </span>
              {text}
            </li>
          ))}
        </ul>
      </section>

      <div className="mt-12 flex flex-col gap-3 sm:flex-row">
        <Link to="/charades/host" className="btn btn-bolly flex-1">
          Host a game
        </Link>
        <Link to="/" className="btn btn-ghost flex-1">
          Back to all games
        </Link>
      </div>
    </BollyShell>
  );
}
