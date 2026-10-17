import './charades.css';
import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import type { CardView, CView } from '../../shared/charades/types';
import { Confetti, HomeMenu, LOGO, PrefsMenu } from '../components/ui';
import { useFx } from '../lib/prefs';
import { Clapper } from './art';
import { fmtClock } from './lib';

// ------------------------------------------------------------------ shell

export function BollyShell({ children, right, wide = false }: { children: ReactNode; right?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    document.title = 'Dumb Charades · Unsorted';
  }, []);
  return (
    <div className="bolly min-h-dvh">
      <div className="bolly-rays" aria-hidden="true" />
      <header className="sticky top-0 z-40 border-b border-[#ffb300]/25 bg-[#14041a]/85 backdrop-blur-md">
        <div className={`mx-auto flex h-14 items-center justify-between gap-3 px-4 ${wide ? 'max-w-7xl' : 'max-w-3xl'}`}>
          <div className="flex items-center gap-3">
            <Link to="/" className="focus-ring rounded-lg" aria-label="Unsorted — main menu (all games)" title="Main menu — all games">
              <img src={LOGO.wordmark} alt="Unsorted" className="h-5 w-auto" />
            </Link>
            <Link to="/charades" className="charades-title hidden border-l border-[#ffb300]/30 pl-3 text-sm focus-ring rounded sm:inline">
              Dumb Charades
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <HomeMenu game="charades" />
            {right}
            <PrefsMenu />
          </div>
        </div>
        <div className="marquee-bulbs" aria-hidden="true" />
      </header>
      <main className={`relative z-10 mx-auto px-4 pb-16 pt-5 ${wide ? 'max-w-7xl' : 'max-w-3xl'}`}>{children}</main>
    </div>
  );
}

// ------------------------------------------------------------------ movie card

const GENRE_STYLE: [RegExp, string, string][] = [
  [/horror/i, 'genre-horror', '👻'],
  [/comedy|satire/i, 'genre-comedy', '😂'],
  [/romance|musical|dance/i, 'genre-romance', '💃'],
  [/action|spy|superhero|heist/i, 'genre-action', '💥'],
  [/thriller|mystery|crime/i, 'genre-thriller', '🕵️'],
  [/sport/i, 'genre-sports', '🏏'],
  [/war|patriotic|historical|period|epic/i, 'genre-history', '⚔️'],
  [/fantasy|sci-fi|mythology|animation/i, 'genre-fantasy', '✨'],
  [/biopic/i, 'genre-biopic', '🎖️'],
];
export function genreLook(genre: string): { cls: string; emoji: string } {
  for (const [re, cls, emoji] of GENRE_STYLE) if (re.test(genre)) return { cls, emoji };
  return { cls: 'genre-drama', emoji: '🎭' };
}

export function MovieCard({ card, big = false, tv = false }: { card: CardView; big?: boolean; tv?: boolean }) {
  const look = genreLook(card.genre);
  return (
    <article key={card.title} className={`movie-card ${look.cls} ${big ? 'movie-card-big' : ''} ${tv ? 'movie-card-tv' : ''}`} data-testid="movie-card" aria-label={`Movie: ${card.title}`}>
      <div className="movie-card-shine" aria-hidden="true" />
      <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
        <span>{card.year ? card.year : 'Your pick'}</span>
        <span aria-label={`${card.words} words`}>
          {Array.from({ length: card.words }, (_, i) => (
            <span key={i} className="word-dot" />
          ))}
          <span className="ml-1">{card.words} {card.words === 1 ? 'word' : 'words'}</span>
        </span>
      </div>
      <h2 className="movie-title" data-testid="movie-title">
        {card.title}
      </h2>
      {card.genre && (
        <p className="mt-2 flex flex-wrap justify-center gap-1.5">
          <span className="text-lg" aria-hidden="true">
            {look.emoji}
          </span>
          {card.genre.split(/,\s*/).map((g) => (
            <span key={g} className="genre-chip">
              {g}
            </span>
          ))}
        </p>
      )}
      {card.leads.length > 0 && (
        <div className="mt-4 text-center">
          <p className="text-[0.65rem] font-semibold uppercase tracking-[0.3em] text-white/60">Starring</p>
          <p className="mt-1 text-sm font-semibold text-white">{card.leads.join(' · ')}</p>
        </div>
      )}
      {!card.verified && <p className="mt-3 text-center text-xs text-white/70">✋ Approved by the host (not checked online)</p>}
    </article>
  );
}

/** Face-down card. Tapping it is the moment the clock starts. */
export function CardBack({ label, onClick, disabled }: { label: string; onClick?: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="card-back focus-ring" onClick={onClick} disabled={disabled} data-testid="card-back">
      <span className="card-back-pattern" aria-hidden="true" />
      <Clapper size={110} className="relative clap-anim" />
      <span className="charades-title relative mt-3 text-3xl">Lights, Camera…</span>
      <span className="relative mt-2 rounded-full bg-[#14041a]/70 px-4 py-2 text-sm font-semibold text-[#ffd98a]">{label}</span>
    </button>
  );
}

// ------------------------------------------------------------------ scores & clock

export function Scoreboard({ view, big = false }: { view: CView; big?: boolean }) {
  const acting = view.status === 'playing' ? view.turn?.team : null;
  return (
    <div className={`grid grid-cols-2 gap-3 ${big ? 'gap-6' : ''}`} data-testid="scoreboard">
      {view.teams.map((t, i) => (
        <div key={i} className={`score-tile team-${i} ${acting === i ? 'is-acting' : ''} ${big ? 'score-tile-big' : ''}`}>
          <div className={`truncate font-semibold uppercase tracking-[0.2em] text-white/80 ${big ? 'text-xl' : 'text-xs'}`}>
            {acting === i && (
              <span className="mr-1" role="img" aria-label="Acting now">
                🎬
              </span>
            )}
            {t.name}
          </div>
          <div key={t.score} className="score-num score-bump" data-testid={`score-${i}`}>
            {t.score}
          </div>
          <div className={`truncate text-white/70 ${big ? 'text-base' : 'text-xs'}`}>
            {t.captain ? (
              <>
                <span className={`mr-1 inline-block h-2 w-2 rounded-full ${t.captain.online ? 'bg-[#6fe39b]' : 'bg-white/30'}`} aria-hidden="true" />
                Captain {t.captain.name}
              </>
            ) : (
              'No captain yet'
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

export function TimerRing({ left, total, paused, big = false }: { left: number; total: number; paused: boolean; big?: boolean }) {
  const size = big ? 250 : 150;
  const r = size / 2 - (big ? 14 : 9);
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, left / total));
  const urgent = left <= 10;
  return (
    <div className={`timer-ring ${urgent ? 'is-urgent' : ''}`} style={{ width: size, height: size }} role="timer" aria-label={`${left} seconds left`}>
      <svg width={size} height={size} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} className="timer-track" strokeWidth={big ? 16 : 10} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="timer-bar"
          strokeWidth={big ? 16 : 10}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div className="timer-text">
        <span className={big ? 'text-7xl' : 'text-4xl'}>{fmtClock(left)}</span>
        {paused && <span className="text-xs font-semibold uppercase tracking-[0.2em] text-[#ffd98a]">Paused</span>}
      </div>
    </div>
  );
}

export function WordBlanks({ n }: { n: number }) {
  return (
    <div className="flex items-end justify-center gap-3" aria-label={`${n} words`} data-testid="word-blanks">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="word-blank" style={{ animationDelay: `${i * 0.12}s` }} />
      ))}
    </div>
  );
}

/** Marigold petals and gold confetti raining down on a correct guess or a win. */
export function Petals({ count = 36 }: { count?: number }) {
  // Portalled to <body>: inside the animated result card, "fixed" would be trapped in the card's box.
  return createPortal(
    <>
      <Confetti palette="party" count={Math.round(count * 1.4)} />
      <div className="petals" aria-hidden="true">
        {Array.from({ length: count }, (_, i) => (
          <span
            key={i}
            className={i % 3 === 0 ? 'petal petal-pink' : i % 3 === 1 ? 'petal' : 'petal petal-gold'}
            style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i * 0.13) % 1.6}s`, animationDuration: `${2.6 + ((i * 0.7) % 2)}s` }}
          />
        ))}
      </div>
    </>,
    document.body,
  );
}

// ------------------------------------------------------------------ sound & haptics per moment

/**
 * Plays the right cue when the game moves: "Action!" when a card is flipped, a
 * whoosh on a swap, tabla ticks in the last 10 seconds, sahi-jawab / sad trombone
 * / gong on the result, and a fanfare for the winner.
 */
export function useCharadesFx(view: CView | null, left: number | null, ticks: boolean) {
  const { play, buzz } = useFx();
  const last = useRef<{ key: string; swaps: number; status: string } | null>(null);
  const t = view?.turn;
  useEffect(() => {
    if (!view) return;
    const key = t ? `${t.n}:${t.stage}` : 'none';
    const prev = last.current;
    last.current = { key, swaps: t?.swapsLeft ?? 0, status: view.status };
    if (!prev) return; // first render: no sound for whatever was already on screen
    if (view.status === 'over' && prev.status !== 'over') {
      play('filmyFanfare');
      buzz([80, 60, 80, 60, 200]);
      return;
    }
    if (!t || prev.key === key) {
      if (t?.stage === 'acting' && t.swapsLeft < prev.swaps) play('whoosh');
      return;
    }
    if (t.stage === 'acting') {
      play('action');
      buzz(60);
    } else if (t.stage === 'done') {
      if (t.result === 'correct') {
        play('filmyWin');
        buzz([60, 40, 60, 40, 120]);
      } else if (t.result === 'timeout') {
        play('gong');
        setTimeout(() => play('filmySad'), 700);
        buzz(300);
      } else {
        play('filmySad');
        buzz(200);
      }
    }
  }, [view?.status, t?.n, t?.stage, t?.swapsLeft]);

  useEffect(() => {
    if (ticks && left !== null && left > 0 && left <= 10 && t?.pausedLeft === null) play('tabla');
  }, [left]);
}
