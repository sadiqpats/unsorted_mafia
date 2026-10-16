import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { QR } from '../../components/ui';
import { sounds } from '../../lib/sound';
import { Clapper, Reel } from '../art';
import { RESULT_LINE, useCharades, useTurnClock } from '../lib';
import { MovieCard, Petals, Scoreboard, TimerRing, useCharadesFx, WordBlanks } from '../ui';
import '../charades.css';

const DISPLAY = { display: true };

/** The big screen: scores, the clock, word blanks and the reveal. Never shows the movie until the turn is over. */
export default function CharadesTV() {
  const code = (useParams().code ?? '').toUpperCase();
  const { view, status, endedReason, serverNow } = useCharades(code, DISPLAY);
  const left = useTurnClock(view, serverNow);
  useCharadesFx(view, left, true);
  const [soundOn, setSoundOn] = useState(false);
  const origin = typeof location !== 'undefined' ? location.origin : '';

  if (status === 'denied') {
    return (
      <div className="bolly grid min-h-dvh place-items-center p-6 text-center">
        <p className="max-w-md text-white/80">{endedReason}</p>
      </div>
    );
  }
  if (!view) return <div className="bolly grid min-h-dvh place-items-center text-white/70">Rolling the film…</div>;
  const t = view.turn;

  return (
    <div className="bolly relative min-h-dvh overflow-hidden px-6 py-5" data-testid="tv">
      <div className="bolly-rays" aria-hidden="true" />
      <div className="tv-spotlight left" aria-hidden="true" />
      <div className="tv-spotlight right" aria-hidden="true" />
      {!soundOn && (
        <button
          className="btn btn-marigold fixed bottom-5 right-5 z-50 !min-h-10 text-sm"
          onClick={() => {
            sounds.unlock();
            setSoundOn(true);
          }}
        >
          🔊 Tap for sound
        </button>
      )}
      <header className="relative z-10 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Clapper size={56} />
          <h1 className="charades-title text-4xl">Bollywood Dumb Charades</h1>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase tracking-[0.3em] text-white/60">Room</div>
          <div className="font-mono text-3xl tracking-[0.3em] text-[#ffd76a]">{view.code}</div>
        </div>
      </header>
      <div className="marquee-bulbs relative z-10 mt-3" aria-hidden="true" />

      <main className="relative z-10 mt-4 grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Scoreboard view={view} big />

          {view.status === 'lobby' && (
            <section className="card p-8 text-center">
              <h2 className="charades-title text-5xl">Captains, scan to join!</h2>
              <p className="mt-2 text-lg text-white/75">One captain per team. Everyone else: warm up those acting muscles.</p>
              <div className="mt-6 flex flex-wrap justify-center gap-10">
                {view.teams.map((tm, i) => (
                  <div key={i} className="flex flex-col items-center gap-3">
                    {tm.captain ? (
                      <div className={`score-tile team-${i} grid h-[220px] w-[220px] place-items-center text-2xl`}>✅ {tm.captain.name}</div>
                    ) : (
                      <QR text={`${origin}/charades/join/${view.code}?team=${i + 1}`} size={220} />
                    )}
                    <span className="charades-title text-2xl">{tm.name}</span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {view.status === 'playing' && t && (
            <section className="text-center">
              <p className="text-xl font-semibold uppercase tracking-[0.3em] text-[#ffd98a]">
                Round {t.round} of {view.settings.rounds}
              </p>
              {t.stage === 'acting' ? (
                <div className="mt-2 flex flex-col items-center gap-5">
                  <h2 className="charades-title tv-big">{view.teams[t.team].name} acting!</h2>
                  <TimerRing left={left ?? 0} total={view.settings.turnSeconds} paused={t.pausedLeft !== null} big />
                  {t.words ? (
                    <div className="space-y-2">
                      <WordBlanks n={t.words} />
                      <p className="text-xl text-white/80">
                        {t.words} {t.words === 1 ? 'word' : 'words'}
                      </p>
                    </div>
                  ) : null}
                </div>
              ) : t.stage === 'done' ? (
                <div className={`result-burst mt-4 ${t.result === 'correct' ? 'result-correct' : 'result-miss'}`} data-testid="tv-result">
                  {t.result === 'correct' && <Petals count={60} />}
                  <div className="result-big tv-big">{RESULT_LINE[t.result ?? 'pass'].big}</div>
                  <p className="mt-1 text-2xl text-white/85">
                    {view.teams[t.team].name}: {RESULT_LINE[t.result ?? 'pass'].sub}
                  </p>
                  {t.card && (
                    <div className="movie-card-tv-wrap mx-auto mt-4 max-w-3xl">
                      <MovieCard card={t.card} tv />
                    </div>
                  )}
                </div>
              ) : (
                <div className="mt-6 flex flex-col items-center gap-4">
                  <Clapper size={140} className="clap-anim" />
                  <h2 className="charades-title tv-big">{view.teams[t.team].name}, get ready!</h2>
                  <p className="text-2xl text-white/80">
                    {t.stage === 'ready'
                      ? 'Movie chosen. Waiting for the captain to flip the card…'
                      : t.stage === 'approval'
                        ? 'The host is checking the movie…'
                        : view.settings.picker === 'rival'
                          ? `${view.teams[1 - t.team].name} is choosing the movie…`
                          : 'The captain is about to flip the card…'}
                  </p>
                </div>
              )}
            </section>
          )}

          {view.status === 'over' && (
            <section className="card relative overflow-hidden p-10 text-center" data-testid="tv-winner">
              <Petals count={80} />
              <div className="text-8xl" aria-hidden="true">
                🏆
              </div>
              <h2 className="charades-title tv-big mt-2">{view.winner === 'tie' ? 'It’s a tie!' : `${view.teams[view.winner as number].name} wins!`}</h2>
              <p className="mt-3 text-3xl text-white/85">
                {view.teams[0].score} — {view.teams[1].score}
              </p>
            </section>
          )}
        </div>

        <aside className="card self-start p-5">
          <div className="mb-3 flex items-center gap-2">
            <Reel size={28} />
            <h3 className="charades-title text-2xl">Now showing</h3>
          </div>
          {view.history.length === 0 ? (
            <p className="text-lg text-white/60">Movies appear here after each turn.</p>
          ) : (
            <ol className="space-y-2">
              {[...view.history].reverse().slice(0, 14).map((h) => (
                <li key={h.n} className="history-row flex items-center justify-between gap-3 rounded-lg bg-black/25 px-3 py-2 text-lg">
                  <span className="min-w-0 truncate">
                    <span className="mr-2" aria-hidden="true">
                      {h.result === 'correct' ? '✅' : h.result === 'timeout' ? '⏰' : '❌'}
                    </span>
                    <b>{h.title}</b>
                  </span>
                  <span className="shrink-0 text-sm text-white/60">{view.teams[h.team].name}</span>
                </li>
              ))}
            </ol>
          )}
        </aside>
      </main>
    </div>
  );
}
