import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { BrandMark, PrefsMenu, Toggle, useConfirm, useTitle } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { DrawMark } from './art';
import { autoPick, freshAuto, imposterCount, pickFits, pickLabel, PICKS, type Auto, type Pick } from './imposters';
import { BOLLYWOOD, OBJECTS, type Card } from './words';

/**
 * Draw the Imposter — a pass-and-play icebreaker on ONE phone. Each round everyone gets the same
 * thing to draw on paper, except the imposter(s), who only see "You are the IMPOSTER" (and,
 * if the host allows it, a vague hint). Draw, show, guess, then reveal. Endless rounds until the
 * host stops; players can be added between rounds. No scores.
 *
 * How many imposters: the host either picks before every round (1–5, all but one, everyone) or
 * lets the auto pattern decide (1, 2, maybe 3–4, then a twist round) — see imposters.ts.
 */

type Deck = 'bollywood' | 'objects' | 'mix';
type Mode = 'auto' | 'choose';
type Stage = 'pass' | 'peek' | 'draw' | 'reveal';
type Round = { n: number; word: string; hint: string; deck: Exclude<Deck, 'mix'>; imposters: number[]; seen: number };
type Game = {
  v: 2;
  players: string[];
  deck: Deck;
  hostPlays: boolean;
  mode: Mode;
  pick: Pick; // "choose" mode: next round's imposters
  auto: Auto; // "auto" mode: where the pattern is
  hints: boolean;
  round: Round | null;
  used: string[];
  stage: Stage;
};

const KEY = 'draw-imposter:game';
const load = (): Game | null => {
  try {
    const g = JSON.parse(sessionStorage.getItem(KEY) ?? 'null');
    return g?.v === 2 ? g : null; // a game saved by the older version just starts fresh
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
function shuffle<T>(a: T[]): T[] {
  const out = [...a];
  for (let i = out.length - 1; i > 0; i--) {
    const j = rand(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function newRound(g: Game): Game {
  const n = (g.round?.n ?? 0) + 1;
  const deck = g.deck === 'mix' ? (Math.random() < 0.5 ? 'bollywood' : 'objects') : g.deck;
  const list: Card[] = deck === 'bollywood' ? BOLLYWOOD : OBJECTS;
  let pool = list.filter((c) => !g.used.includes(c.w));
  if (!pool.length) pool = list;
  const card = pool[rand(pool.length)];
  let pick = g.pick;
  let auto = g.auto;
  if (g.mode === 'auto') ({ pick, next: auto } = autoPick(g.auto));
  const count = imposterCount(pick, g.players.length);
  const imposters = shuffle([...g.players.keys()])
    .slice(0, count)
    .sort((a, b) => a - b);
  return { ...g, auto, round: { n, word: card.w, hint: card.hint, deck, imposters, seen: 0 }, used: [...g.used, card.w].slice(-80), stage: 'pass' };
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
    <div className="draw-page grain vignette min-h-dvh overflow-x-hidden">
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
      <div className="anim-fade-up mx-auto w-fit">
        <DrawMark size={92} />
      </div>
      <h1 className="brand-title mt-3 text-4xl font-black">Draw the Imposter</h1>
      {sub && <p className="mt-2 font-[family-name:var(--font-serif)] text-lg italic text-mute">{sub}</p>}
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

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="mb-3 flex items-center gap-3 text-base font-semibold">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-gold/50 font-[family-name:var(--font-display)] text-sm text-gold">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Segmented choice: big, thumb-friendly buttons. */
function Segmented<T extends string>({ value, onChange, options, label }: { value: T; onChange: (v: T) => void; options: [T, string, string?][]; label: string }) {
  return (
    <div className={`grid gap-2 ${options.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`} role="radiogroup" aria-label={label}>
      {options.map(([v, title, sub]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} className={`seg ${value === v ? 'is-on' : ''}`}>
          <span className="font-semibold">{title}</span>
          {sub && <span className="mt-0.5 block text-xs font-normal text-mute">{sub}</span>}
        </button>
      ))}
    </div>
  );
}

/** 1 2 3 4 5 · All but 1 · Everyone. Picks that can't happen at this table are greyed out. */
function PickChips({ value, players, onChange }: { value: Pick; players: number; onChange: (p: Pick) => void }) {
  return (
    <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Number of imposters">
      {PICKS.map((p) => {
        const fits = pickFits(p, players);
        return (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value === p}
            disabled={!fits}
            onClick={() => onChange(p)}
            className={`pick ${typeof p === 'number' ? 'is-num' : ''} ${value === p ? 'is-on' : ''}`}
          >
            {pickLabel(p)}
          </button>
        );
      })}
    </div>
  );
}

function pickExplain(pick: Pick, players: number) {
  if (pick === 'all') return `Everyone is the imposter. Nobody has the word — and nobody knows that.`;
  if (pick === 'allButOne') return `${players - 1} imposters. Only one person has the real word!`;
  const n = imposterCount(pick, players);
  return `${n} imposter${n === 1 ? '' : 's'} this round.`;
}

function Setup({ onStart }: { onStart: (g: Game) => void }) {
  const [count, setCount] = useState(6);
  const [names, setNames] = useState<string[]>(() => Array.from({ length: 30 }, () => ''));
  const [deck, setDeck] = useState<Deck>('mix');
  const [hostPlays, setHostPlays] = useState(true);
  // A host who plays usually wants the surprise; a host who only runs the game usually picks.
  const [mode, setMode] = useState<Mode>('auto');
  const [modeTouched, setModeTouched] = useState(false);
  const [pick, setPick] = useState<Pick>(1);
  const [hints, setHints] = useState(true);
  const changeHostPlays = (v: boolean) => {
    setHostPlays(v);
    if (!modeTouched) setMode(v ? 'auto' : 'choose');
  };
  const start = () => {
    const players = Array.from({ length: count }, (_, i) => names[i].trim() || (hostPlays && i === 0 ? 'Host' : `Player ${i + 1}`));
    onStart({ v: 2, players, deck, hostPlays, mode, pick: pickFits(pick, count) ? pick : 1, auto: freshAuto(), hints, round: null, used: [], stage: 'pass' });
  };
  return (
    <div className="space-y-4 pt-2">
      <Title sub="One phone. Draw on paper. Spot the faker." />

      <Step n={1} title="Who’s playing?">
        <div className="flex items-center justify-center gap-4">
          <button className="btn btn-ghost !min-h-12 w-14 text-2xl" onClick={() => setCount((c) => Math.max(3, c - 1))} aria-label="One fewer">
            −
          </button>
          <div className="text-center">
            <span className="block w-20 font-[family-name:var(--font-display)] text-5xl text-gold" data-testid="draw-count">
              {count}
            </span>
            <span className="text-xs text-mute">players</span>
          </div>
          <button className="btn btn-ghost !min-h-12 w-14 text-2xl" onClick={() => setCount((c) => Math.min(30, c + 1))} aria-label="One more">
            +
          </button>
        </div>
        <div className="mt-3">
          <Toggle label="I’m playing too" hint={hostPlays ? 'You’re one of the players, so you won’t know who the imposter is.' : 'You just run the game and pass the phone round.'} checked={hostPlays} onChange={changeHostPlays} />
        </div>
        <details className="mt-2 rounded-xl border border-line/60 bg-black/20 p-3">
          <summary className="cursor-pointer text-sm font-medium">Add names (optional)</summary>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {Array.from({ length: count }, (_, i) => (
              <input
                key={i}
                className="field"
                value={names[i]}
                maxLength={16}
                aria-label={`Name of player ${i + 1}`}
                placeholder={hostPlays && i === 0 ? 'You (host)' : `Player ${i + 1}`}
                onChange={(e) => setNames((n) => n.map((x, k) => (k === i ? e.target.value : x)))}
              />
            ))}
          </div>
        </details>
      </Step>

      <Step n={2} title="What do you draw?">
        <Segmented
          label="Deck"
          value={deck}
          onChange={setDeck}
          options={[
            ['bollywood', '🎬 Filmy', `${BOLLYWOOD.length} films`],
            ['objects', '🤪 Quirky', `${OBJECTS.length} scenes`],
            ['mix', '🎲 Mix', 'a bit of both'],
          ]}
        />
      </Step>

      <Step n={3} title="Imposters">
        <Segmented
          label="How many imposters"
          value={mode}
          onChange={(m) => {
            setMode(m);
            setModeTouched(true);
          }}
          options={[
            ['auto', '🎲 Surprise me', 'the game decides'],
            ['choose', '🎯 I choose', 'pick every round'],
          ]}
        />
        {mode === 'auto' ? (
          <p className="mt-3 rounded-xl border border-line/60 bg-black/20 p-3 text-sm text-mute">
            Starts with one imposter and builds up round by round — then comes a twist round where <b className="text-bone">everyone</b> (or everyone but one) is the imposter. Then it starts again.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            <PickChips value={pick} players={count} onChange={setPick} />
            <p className="text-sm text-mute">{pickExplain(pickFits(pick, count) ? pick : 1, count)} You can change it before every round.</p>
            {hostPlays && <p className="text-xs text-gold">You’re playing, so you’ll know how many — but not who.</p>}
          </div>
        )}
        <div className="mt-2">
          <Toggle label="Give the imposter a secret hint" hint="A vague clue like “comedy · money trouble”, to help them bluff." checked={hints} onChange={setHints} />
        </div>
      </Step>

      <button className="btn btn-gold w-full text-lg" onClick={start}>
        Start round 1
      </button>
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
        <li>Reveal. Sometimes there are more imposters than you think…</li>
      </ol>
    </div>
  );
}

/** A 60/90-second drawing clock, so the table doesn't wait forever for the slowest artist. */
function DrawClock() {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (left === null || left <= 0) {
      if (left === 0) navigator.vibrate?.([200, 100, 200]);
      return;
    }
    const t = setTimeout(() => setLeft((l) => (l === null ? null : l - 1)), 1000);
    return () => clearTimeout(t);
  }, [left]);
  if (left === null)
    return (
      <div className="flex justify-center gap-2">
        {[60, 90].map((s) => (
          <button key={s} className="btn btn-ghost !min-h-10 text-sm" onClick={() => setLeft(s)}>
            ⏱ {s}s timer
          </button>
        ))}
      </div>
    );
  return (
    <button className={`draw-clock ${left <= 10 ? 'is-urgent' : ''}`} onClick={() => setLeft(null)} aria-label="Stop the timer">
      {left > 0 ? `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}` : 'Pens down! ✋'}
    </button>
  );
}

function Play({ game, setGame }: { game: Game; setGame: (g: Game | null) => void }) {
  const confirm = useConfirm();
  const [newName, setNewName] = useState('');
  const r = game.round!;
  const total = game.players.length;
  const who = game.players[r.seen];
  const isImp = r.imposters.includes(r.seen);
  const everyone = r.imposters.length === total;
  const lonely = !everyone && r.imposters.length === total - 1 && total > 2 ? game.players.find((_, i) => !r.imposters.includes(i)) : null;
  const set = (patch: Partial<Game>) => setGame({ ...game, ...patch });
  const nextPlayer = () => (r.seen + 1 >= total ? set({ stage: 'draw' }) : set({ stage: 'pass', round: { ...r, seen: r.seen + 1 } }));
  const stop = async () => {
    if (await confirm({ title: 'Stop the game?', body: 'This ends the game for everyone.', confirm: 'Stop' })) setGame(null);
  };
  const addPlayer = () => {
    const name = newName.trim() || `Player ${total + 1}`;
    setGame({ ...game, players: [...game.players, name] });
    setNewName('');
  };

  return (
    <div className="space-y-4 pt-2">
      <div className="flex items-center justify-between gap-2">
        <span className="chip">Round {r.n}</span>
        <span className="chip">{r.deck === 'bollywood' ? '🎬 Filmy' : '🤪 Quirky'}</span>
        <span className="chip">👥 {total}</span>
      </div>

      {game.stage === 'pass' && (
        <div className="card flex min-h-[60dvh] flex-col items-center justify-center gap-5 p-6 text-center" data-testid="draw-pass">
          <ol className="flex flex-wrap justify-center gap-1.5" aria-label="Who has looked">
            {game.players.map((p, i) => (
              <li key={i} className={`h-2 w-2 rounded-full ${i < r.seen ? 'bg-gold' : i === r.seen ? 'bg-bone ring-2 ring-gold/50' : 'bg-white/15'}`} title={p} />
            ))}
          </ol>
          <p className="eyebrow">Pass the phone to</p>
          <div className="draw-avatar" aria-hidden="true">
            {who.slice(0, 1).toUpperCase()}
          </div>
          <p className="brand-title break-words text-5xl font-black">{who}</p>
          <p className="text-mute">Everyone else — look away! 🙈</p>
          <button className="btn btn-gold w-full max-w-xs text-lg" onClick={() => set({ stage: 'peek' })}>
            I’m {who}, show my word
          </button>
          <p className="text-xs text-mute">
            {r.seen + 1} of {total}
          </p>
        </div>
      )}

      {game.stage === 'peek' && (
        <div className="flex min-h-[60dvh] flex-col items-center justify-center gap-5 text-center" data-testid="draw-peek">
          {isImp ? (
            <div className="imposter-card anim-pop w-full p-6">
              <div className="mx-auto grid h-24 w-24 place-items-center rounded-full border-2 border-ember/70 bg-black/40 text-6xl" aria-hidden="true">
                🕵️
              </div>
              <p className="mt-4 text-sm uppercase tracking-[0.3em] text-ember">Shh…</p>
              <p className="brand-title mt-1 text-5xl font-black !text-[#ffb4ac]">You are the IMPOSTER</p>
              <p className="mt-3 text-mute">You don’t know the word. Watch the others and fake your drawing!</p>
              {game.hints && (
                <p className="mt-4 inline-block rounded-full border border-gold/50 bg-gold/10 px-4 py-1.5 text-sm" data-testid="draw-hint">
                  💡 Hint: <b className="text-gold">{r.hint}</b>
                </p>
              )}
            </div>
          ) : (
            <div className="paper anim-pop w-full px-6 pb-8 pt-6">
              <p className="paper-eyebrow">Draw this</p>
              <p className="paper-word" data-testid="draw-word">
                {r.word}
              </p>
              <p className="mt-4 text-sm text-[#6b5d4c]">Don’t say it out loud. Draw it on your paper.</p>
            </div>
          )}
          <button className="btn btn-primary w-full max-w-xs text-lg" onClick={nextPlayer}>
            Got it, hide &amp; pass
          </button>
        </div>
      )}

      {game.stage === 'draw' && (
        <div className="card flex min-h-[55dvh] flex-col items-center justify-center gap-5 p-6 text-center" data-testid="draw-drawing">
          <DrawMark size={110} />
          <p className="brand-title text-4xl font-black">Everyone, draw!</p>
          <p className="text-mute">Then show your drawings, talk it out, and vote on who the imposter is.</p>
          <DrawClock />
          <button className="btn btn-gold w-full max-w-xs text-lg" onClick={() => set({ stage: 'reveal' })}>
            Reveal the imposter
          </button>
        </div>
      )}

      {game.stage === 'reveal' && (
        <div className="space-y-4" data-testid="draw-reveal">
          <div className="paper anim-pop px-6 pb-6 pt-5 text-center">
            <p className="paper-eyebrow">The word was</p>
            <p className="paper-word !text-4xl">{r.word}</p>
            {game.hints && <p className="mt-2 text-sm text-[#6b5d4c]">Imposter’s hint: {r.hint}</p>}
          </div>
          <div className="imposter-card stamp-drop p-5 text-center">
            {everyone ? (
              <>
                <p className="text-6xl" aria-hidden="true">
                  😈
                </p>
                <p className="brand-title mt-1 text-3xl font-black !text-[#ffb4ac]">Everyone was the imposter!</p>
                <p className="mt-1 text-mute">Nobody had the word. Look at those drawings…</p>
              </>
            ) : lonely ? (
              <>
                <p className="text-sm uppercase tracking-[0.25em] text-ember">Plot twist</p>
                <p className="brand-title mt-2 text-3xl font-black !text-[#ffb4ac]">Everyone except {lonely} was the imposter!</p>
                <p className="mt-1 text-mute">{lonely} was the only one who knew the word.</p>
              </>
            ) : (
              <>
                <p className="text-sm uppercase tracking-[0.25em] text-ember">{r.imposters.length === 1 ? 'The imposter was' : `The ${r.imposters.length} imposters were`}</p>
                <p className="brand-title mt-2 text-3xl font-black">{r.imposters.map((i) => game.players[i]).join(' & ')}</p>
              </>
            )}
          </div>

          <div className="card space-y-3 p-4">
            {game.mode === 'choose' ? (
              <>
                <p className="text-sm font-medium">Next round: how many imposters?</p>
                <PickChips value={game.pick} players={total} onChange={(p) => set({ pick: p })} />
              </>
            ) : (
              <p className="text-sm text-mute">🎲 The game picks the next imposters.</p>
            )}
            <button className="text-xs text-gold underline underline-offset-4" onClick={() => set(game.mode === 'auto' ? { mode: 'choose' } : { mode: 'auto', auto: freshAuto() })}>
              {game.mode === 'auto' ? 'Let me choose instead' : 'Switch to Surprise me'}
            </button>
          </div>

          <button className="btn btn-gold w-full text-lg" onClick={() => setGame(newRound(pickFits(game.pick, total) ? game : { ...game, pick: 1 }))}>
            Next round →
          </button>

          <form
            className="card flex gap-2 p-3"
            onSubmit={(e) => {
              e.preventDefault();
              addPlayer();
            }}
          >
            <input className="field min-w-0 flex-1" value={newName} maxLength={16} onChange={(e) => setNewName(e.target.value)} placeholder="New player’s name" aria-label="New player’s name" />
            <button className="btn btn-ghost shrink-0" aria-label="+ Add a player">+ Add</button>
          </form>
          <p className="text-center text-xs text-mute">{game.players.join(' · ')}</p>
          <div className="text-center">
            <button className="btn btn-ghost !min-h-10 text-sm text-ember" onClick={stop}>
              Stop game
            </button>
          </div>
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
