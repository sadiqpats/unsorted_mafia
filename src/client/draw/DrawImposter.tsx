import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark, PrefsMenu, useConfirm, useTitle } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { BOLLYWOOD, OBJECTS } from './words';

/**
 * Draw the Imposter — a pass-and-play icebreaker on ONE phone. Each round everyone gets the same
 * thing to draw on paper, except the imposter(s), who only see "You are the IMPOSTER". Draw,
 * show, guess, then reveal. Usually one imposter, sometimes two or three, and once in a while
 * everybody is the imposter. Endless rounds until the host stops; players can be added between
 * rounds. No scores.
 */

type Deck = 'bollywood' | 'objects' | 'mix';
type Round = { n: number; word: string; deck: Deck; imposters: number[]; seen: number };
type Game = { players: string[]; deck: Deck; round: Round | null; used: string[]; allLast: number; stage: 'pass' | 'peek' | 'draw' | 'reveal' };

const KEY = 'draw-imposter:game';
const load = (): Game | null => {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
  } catch {
    return null;
  }
};
const save = (g: Game | null) => {
  try {
    if (g) sessionStorage.setItem(KEY, JSON.stringify(g));
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the game just won't survive a reload */
  }
};

const rand = (n: number) => Math.floor(Math.random() * n);

/** How many imposters this round: usually 1, sometimes 2 or 3, now and then everyone. */
function imposterCount(players: number, roundNo: number, allLast: number): number {
  if (players <= 3 || roundNo <= 2) return 1;
  const r = Math.random();
  if (roundNo - allLast >= 5 && r < 0.07) return players; // everyone!
  if (players >= 7 && r < 0.17) return 3;
  if (r < 0.35) return 2;
  return 1;
}

function newRound(g: Game): Game {
  const n = (g.round?.n ?? 0) + 1;
  const deck: Deck = g.deck === 'mix' ? (Math.random() < 0.5 ? 'bollywood' : 'objects') : g.deck;
  const list = deck === 'bollywood' ? BOLLYWOOD : OBJECTS;
  let pool = list.filter((w) => !g.used.includes(w));
  if (!pool.length) pool = list;
  const word = pool[rand(pool.length)];
  const count = imposterCount(g.players.length, n, g.allLast);
  const order = [...g.players.keys()].sort(() => Math.random() - 0.5);
  const imposters = order.slice(0, count).sort((a, b) => a - b);
  return { ...g, round: { n, word, deck, imposters, seen: 0 }, used: [...g.used, word].slice(-300), allLast: count === g.players.length ? n : g.allLast, stage: 'pass' };
}

export default function DrawImposter() {
  useTitle('Draw the Imposter · Unsorted');
  const [game, setGame] = useState<Game | null>(load);
  const [authed, setAuthed] = useState(() => {
    try {
      return sessionStorage.getItem('draw-imposter:ok') === '1';
    } catch {
      return false;
    }
  });
  useEffect(() => save(game), [game]);

  return (
    <div className="grain vignette min-h-dvh overflow-x-hidden">
      <header className="relative z-40 mx-auto flex h-16 max-w-xl items-center justify-between px-4">
        <BrandMark label={null} to="/" />
        <PrefsMenu />
      </header>
      <main className="relative z-10 mx-auto max-w-xl px-4 pb-16">
        {!authed ? <Gate onOk={() => setAuthed(true)} /> : !game ? <Setup onStart={(g) => setGame(newRound(g))} /> : <Play game={game} setGame={setGame} />}
      </main>
    </div>
  );
}

function Title({ sub }: { sub?: string }) {
  return (
    <div className="text-center">
      <div className="text-6xl" aria-hidden="true">
        🎨🕵️
      </div>
      <h1 className="brand-title mt-2 text-4xl font-black">Draw the Imposter</h1>
      {sub && <p className="mt-2 text-mute">{sub}</p>}
    </div>
  );
}

function Gate({ onOk }: { onOk: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async () => {
    setBusy(true);
    setErr(null);
    try {
      await api('/api/host-check', { hostCode: code });
      try {
        sessionStorage.setItem('draw-imposter:ok', '1');
      } catch {
        /* fine */
      }
      onOk();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-6 pt-6">
      <Title sub="One phone. Pass it round. Draw on paper. Find the imposter." />
      <form
        className="card space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) go();
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Host code</span>
          <input className="field w-full" type="password" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Only the host knows it" />
        </label>
        {err && <p className="text-sm text-ember">{err}</p>}
        <button className="btn btn-primary w-full" disabled={busy || !code.trim()}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
      </form>
    </div>
  );
}

function Setup({ onStart }: { onStart: (g: Game) => void }) {
  const [count, setCount] = useState(6);
  const [names, setNames] = useState<string[]>(() => Array.from({ length: 30 }, () => ''));
  const [deck, setDeck] = useState<Deck>('mix');
  const start = () => {
    const players = Array.from({ length: count }, (_, i) => names[i].trim() || `Player ${i + 1}`);
    onStart({ players, deck, round: null, used: [], allLast: -99, stage: 'pass' });
  };
  return (
    <div className="space-y-5 pt-2">
      <Title />
      <div className="card space-y-5 p-5">
        <div>
          <p className="mb-2 text-sm font-medium">How many players?</p>
          <div className="flex items-center justify-center gap-4">
            <button className="btn btn-ghost !min-h-12 w-14 text-2xl" onClick={() => setCount((c) => Math.max(3, c - 1))} aria-label="One fewer">
              −
            </button>
            <span className="w-16 text-center font-[family-name:var(--font-display)] text-5xl text-gold" data-testid="draw-count">
              {count}
            </span>
            <button className="btn btn-ghost !min-h-12 w-14 text-2xl" onClick={() => setCount((c) => Math.min(30, c + 1))} aria-label="One more">
              +
            </button>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">What do you draw?</p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                ['bollywood', '🎬 Bollywood'],
                ['objects', '🧸 Things'],
                ['mix', '🎲 Mix'],
              ] as const
            ).map(([d, label]) => (
              <button key={d} role="radio" aria-checked={deck === d} onClick={() => setDeck(d)} className={`rounded-xl border p-3 text-sm font-semibold ${deck === d ? 'border-gold bg-gold/15' : 'border-line bg-black/20'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>
        <details className="rounded-xl border border-line/60 bg-black/20 p-3">
          <summary className="cursor-pointer text-sm font-medium">Names (optional)</summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {Array.from({ length: count }, (_, i) => (
              <input key={i} className="field" value={names[i]} maxLength={16} placeholder={`Player ${i + 1}`} onChange={(e) => setNames((n) => n.map((x, k) => (k === i ? e.target.value : x)))} />
            ))}
          </div>
        </details>
        <button className="btn btn-gold w-full text-lg" onClick={start}>
          Start round 1
        </button>
      </div>
      <HowTo />
    </div>
  );
}

function HowTo() {
  return (
    <div className="card p-5 text-sm text-mute">
      <p className="mb-2 font-semibold text-bone">How to play</p>
      <ol className="list-decimal space-y-1 pl-5">
        <li>Pass the phone round. Each player taps to see their secret word, then hides it.</li>
        <li>Everyone draws their word on paper. The imposter doesn’t know it, so they fake it!</li>
        <li>Show the drawings, talk, and guess who the imposter is.</li>
        <li>Reveal. Usually one imposter, sometimes two or three… and once in a while, everyone.</li>
      </ol>
    </div>
  );
}

function Play({ game, setGame }: { game: Game; setGame: (g: Game | null) => void }) {
  const confirm = useConfirm();
  const r = game.round!;
  const who = game.players[r.seen];
  const isImp = r.imposters.includes(r.seen);
  const everyone = r.imposters.length === game.players.length;
  const set = (patch: Partial<Game>) => setGame({ ...game, ...patch });
  const nextPlayer = () => (r.seen + 1 >= game.players.length ? set({ stage: 'draw', round: { ...r, seen: r.seen } }) : set({ stage: 'pass', round: { ...r, seen: r.seen + 1 } }));
  const stop = async () => {
    if (await confirm({ title: 'Stop the game?', body: 'This ends the game for everyone.', confirm: 'Stop' })) setGame(null);
  };

  return (
    <div className="space-y-5 pt-2">
      <div className="flex items-center justify-between">
        <span className="chip">Round {r.n}</span>
        <span className="chip">{r.deck === 'bollywood' ? '🎬 Bollywood' : '🧸 Things'}</span>
        <span className="chip">👥 {game.players.length}</span>
      </div>

      {game.stage === 'pass' && (
        <div className="card flex min-h-[60dvh] flex-col items-center justify-center gap-6 p-6 text-center" data-testid="draw-pass">
          <p className="eyebrow">Pass the phone to</p>
          <p className="brand-title text-5xl font-black">{who}</p>
          <p className="text-mute">Nobody else looks!</p>
          <button className="btn btn-gold w-full max-w-xs text-lg" onClick={() => set({ stage: 'peek' })}>
            I’m {who}, show my word
          </button>
          <p className="text-xs text-mute">
            {r.seen + 1} of {game.players.length}
          </p>
        </div>
      )}

      {game.stage === 'peek' && (
        <div className={`card flex min-h-[60dvh] flex-col items-center justify-center gap-5 p-6 text-center ${isImp ? 'border-ember/70 bg-crimson/20' : 'border-gold/60'}`} data-testid="draw-peek">
          {isImp ? (
            <>
              <div className="text-7xl" aria-hidden="true">
                🕵️
              </div>
              <p className="text-sm uppercase tracking-[0.3em] text-ember">Shh…</p>
              <p className="brand-title text-5xl font-black text-ember">You are the IMPOSTER</p>
              <p className="text-mute">You don’t know the word. Watch the others and fake your drawing!</p>
            </>
          ) : (
            <>
              <p className="eyebrow">Draw this</p>
              <p className="brand-title break-words text-5xl font-black" data-testid="draw-word">
                {r.word}
              </p>
              <p className="text-mute">Don’t say it out loud. Draw it on your paper.</p>
            </>
          )}
          <button className="btn btn-primary w-full max-w-xs text-lg" onClick={nextPlayer}>
            Got it, hide &amp; pass
          </button>
        </div>
      )}

      {game.stage === 'draw' && (
        <div className="card flex min-h-[55dvh] flex-col items-center justify-center gap-5 p-6 text-center" data-testid="draw-drawing">
          <div className="text-7xl" aria-hidden="true">
            ✏️
          </div>
          <p className="brand-title text-4xl font-black">Everyone, draw!</p>
          <p className="text-mute">Then show your drawings, talk it out, and vote on who the imposter is.</p>
          <button className="btn btn-gold w-full max-w-xs text-lg" onClick={() => set({ stage: 'reveal' })}>
            Reveal the imposter
          </button>
        </div>
      )}

      {game.stage === 'reveal' && (
        <div className="card space-y-5 p-6 text-center" data-testid="draw-reveal">
          <p className="eyebrow">The word was</p>
          <p className="brand-title break-words text-4xl font-black">{r.word}</p>
          <div className="rounded-2xl border border-ember/60 bg-crimson/15 p-4">
            {everyone ? (
              <>
                <p className="text-6xl" aria-hidden="true">
                  😈
                </p>
                <p className="brand-title text-3xl font-black text-ember">Everyone was the imposter!</p>
                <p className="mt-1 text-mute">Nobody had the word. Look at those drawings…</p>
              </>
            ) : (
              <>
                <p className="text-sm uppercase tracking-[0.25em] text-ember">{r.imposters.length === 1 ? 'The imposter was' : `The ${r.imposters.length} imposters were`}</p>
                <p className="brand-title mt-2 text-3xl font-black">{r.imposters.map((i) => game.players[i]).join(' & ')}</p>
              </>
            )}
          </div>
          <button className="btn btn-gold w-full text-lg" onClick={() => setGame(newRound(game))}>
            Next round →
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button className="btn btn-ghost" onClick={() => setGame({ ...game, players: [...game.players, `Player ${game.players.length + 1}`] })}>
              + Add a player
            </button>
            <button className="btn btn-ghost text-ember" onClick={stop}>
              Stop game
            </button>
          </div>
          <p className="text-xs text-mute">{game.players.join(' · ')}</p>
        </div>
      )}

      {game.stage !== 'reveal' && (
        <div className="text-center">
          <button className="text-xs text-mute underline" onClick={stop}>
            Stop game
          </button>
        </div>
      )}
      <p className="text-center text-xs text-mute">
        <Link to="/" className="underline">
          Back to all games
        </Link>
      </p>
    </div>
  );
}
