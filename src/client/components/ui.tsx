import QRCode from 'qrcode';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ALIGNMENT_LABEL } from '../../shared/roles';
import type { Alignment, LogEntry } from '../../shared/types';
import type { PublicPlayer } from '../../shared/view-types';
import type { ConnStatus } from '../lib/useRoom';
import { useFx, usePrefs } from '../lib/prefs';
import { sounds } from '../lib/sound';
import { Avatar } from './Avatar';

// ------------------------------------------------------------------ brand

/** Unsorted brand assets (light lettering for the dark site; yellow ring kept). */
export const LOGO = {
  wordmark: '/brand/unsorted-wordmark-light.png',
  full: '/brand/unsorted-logo-light.png',
  mark: '/brand/unsorted-mark.png',
};

/** Logo → main menu (all games); the game name next to it → that game's menu. */
export function BrandMark({ compact = false, label = 'MAFIA NIGHT', to = '/mafia' }: { compact?: boolean; label?: string | null; to?: string }) {
  return (
    <div className="flex items-center gap-3">
      <Link to="/" className="focus-ring rounded-lg" aria-label="Unsorted — main menu (all games)" title="Main menu — all games">
        <img src={LOGO.wordmark} alt="Unsorted" className={compact ? 'h-5 w-auto' : 'h-7 w-auto'} />
      </Link>
      {label && (
        <Link
          to={to}
          className={`hidden whitespace-nowrap border-l border-line pl-3 font-[family-name:var(--font-display)] tracking-[0.16em] text-gold focus-ring rounded sm:inline ${compact ? 'text-[0.7rem]' : 'text-sm'}`}
        >
          {label}
        </Link>
      )}
    </div>
  );
}

/** A clear "back to the main menu" pill for the top of each game's home page. */
export function MainMenuLink({ className = '' }: { className?: string }) {
  return (
    <Link to="/" className={`main-menu-link focus-ring ${className}`}>
      <span aria-hidden="true">←</span> Main menu · all games
    </Link>
  );
}

/** Sets the browser tab title while a page is shown (the site hosts more than one game). */
export function useTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}

export function Shell({ children, right, wide = false }: { children: ReactNode; right?: ReactNode; wide?: boolean }) {
  useTitle('Mafia Night · Unsorted');
  return (
    <div className="grain vignette min-h-dvh">
      <div className="ambient" aria-hidden="true" />
      <header className="sticky top-0 z-40 border-b border-line/60 bg-ink/80 backdrop-blur-md">
        <div className={`mx-auto flex h-14 items-center justify-between gap-3 px-4 ${wide ? 'max-w-7xl' : 'max-w-3xl'}`}>
          <BrandMark compact />
          <div className="flex items-center gap-2">
            <HomeMenu game="mafia" />
            {right}
          </div>
        </div>
      </header>
      <main className={`relative z-10 mx-auto px-4 pb-16 pt-5 ${wide ? 'max-w-7xl' : 'max-w-3xl'}`}>{children}</main>
    </div>
  );
}

// ------------------------------------------------------------------ alignment

const ALIGN_ICON: Record<Alignment, string> = { good: '🛡️', mafia: '🗡', evil: '😈', neutral: '◆' };
const ALIGN_CLASS: Record<Alignment, string> = {
  good: 'text-good border-good/40 bg-good/5',
  mafia: 'text-ember border-crimson/50 bg-crimson/10',
  evil: 'text-[#e07ac8] border-[#8e2f7a]/60 bg-[#8e2f7a]/15',
  neutral: 'text-neutral border-neutral/40 bg-neutral/10',
};

/** Alignment is always shown with an icon AND words — never colour alone. */
export function AlignmentBadge({ alignment }: { alignment: Alignment }) {
  return (
    <span className={`chip ${ALIGN_CLASS[alignment]}`}>
      <span aria-hidden="true">{ALIGN_ICON[alignment]}</span>
      {ALIGNMENT_LABEL[alignment]}
    </span>
  );
}

// ------------------------------------------------------------------ timer

export function useCountdown(endsAt: number | null, serverNow: () => number, pausedMs: number | null) {
  const [left, setLeft] = useState<number | null>(null);
  useEffect(() => {
    if (pausedMs !== null) {
      setLeft(pausedMs < 0 ? null : pausedMs);
      return;
    }
    if (endsAt === null) {
      setLeft(null);
      return;
    }
    const update = () => setLeft(Math.max(0, endsAt - serverNow()));
    update();
    const t = setInterval(update, 250);
    return () => clearInterval(t);
  }, [endsAt, pausedMs, serverNow]);
  return left;
}

export function fmt(ms: number) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function Timer({ endsAt, opensAt = null, serverNow, pausedMs, large = false }: { endsAt: number | null; opensAt?: number | null; serverNow: () => number; pausedMs: number | null; large?: boolean }) {
  const left = useCountdown(endsAt, serverNow, pausedMs);
  const toOpen = useCountdown(opensAt, serverNow, pausedMs);
  const { play } = useFx();
  const secs = left === null ? null : Math.ceil(left / 1000);
  useEffect(() => {
    // Soft tick for the last 5 seconds — the clock is public, so every phone ticks together.
    if (secs !== null && secs > 0 && secs <= 5 && pausedMs === null) play('tick');
  }, [secs]);
  // The short break at the start of Dawn/Night: show when actions open instead of the full clock.
  if (toOpen !== null && toOpen > 0 && pausedMs === null) {
    return (
      <span role="timer" aria-label={`Starts in ${Math.ceil(toOpen / 1000)} seconds`} className={`inline-flex items-baseline gap-2 font-[family-name:var(--font-display)] tabular-nums text-gold ${large ? 'text-4xl md:text-5xl' : 'text-base'}`}>
        <span className={large ? 'text-2xl' : 'text-xs'}>Starts in</span> {Math.ceil(toOpen / 1000)}
      </span>
    );
  }
  if (left === null) return pausedMs !== null ? <span className="chip text-gold">⏸ Paused</span> : null;
  const urgent = left < 10_000 && pausedMs === null;
  return (
    <span
      role="timer"
      aria-label={`${Math.ceil(left / 1000)} seconds left`}
      className={`inline-block font-[family-name:var(--font-display)] tabular-nums ${large ? 'text-6xl md:text-8xl' : 'text-lg'} ${urgent ? 'timer-urgent text-ember' : 'text-bone'}`}
    >
      {pausedMs !== null && '⏸ '}
      {fmt(left)}
    </span>
  );
}

// ------------------------------------------------------------------ connection

export function ConnectionBadge({ status }: { status: ConnStatus }) {
  const map: Record<ConnStatus, [string, string]> = {
    connecting: ['bg-gold', 'Connecting'],
    online: ['bg-ok', 'Live'],
    offline: ['bg-gold', 'Reconnecting…'],
    denied: ['bg-ember', 'No access'],
    ended: ['bg-ember', 'Session ended'],
  };
  const [dot, label] = map[status];
  return (
    <span className="chip text-mute" role="status" aria-live="polite">
      <span className={`h-2 w-2 rounded-full ${dot} ${status === 'offline' ? 'animate-pulse' : ''}`} aria-hidden="true" />
      {label}
    </span>
  );
}

export function OfflineBanner({ status }: { status: ConnStatus }) {
  // Only warn if the connection stays down for a few seconds; brief blips reconnect silently.
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (status !== 'offline') return setShow(false);
    const t = setTimeout(() => setShow(true), 4000);
    return () => clearTimeout(t);
  }, [status]);
  if (!show) return null;
  return (
    <div className="fixed inset-x-0 top-14 z-50 mx-auto max-w-md px-4" role="alert">
      <div className="rounded-xl border border-ember/50 bg-blood/90 px-4 py-2 text-center text-sm">
        Connection lost — reconnecting automatically. Your seat and role are safe.
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ settings toggles

/** 🏠 Home: back to this game's menu, or to the Unsorted main menu with every game. */
export function HomeMenu({ game }: { game: 'mafia' | 'charades' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const items: [string, string, string][] =
    game === 'mafia'
      ? [
          ['/mafia', '🎩', 'Mafia Night menu'],
          ['/', '🏠', 'Main menu — all games'],
        ]
      : [
          ['/charades', '🎬', 'Dumb Charades menu'],
          ['/', '🏠', 'Main menu — all games'],
        ];
  return (
    <div className="relative" ref={ref}>
      <button className="btn btn-ghost !min-h-10 !px-3 !py-1.5 text-sm" aria-expanded={open} aria-haspopup="menu" aria-label="Home menu" onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">🏠</span>
        <span className="sr-only sm:not-sr-only">Home</span>
      </button>
      {open && (
        <div className="card home-menu anim-pop fixed right-3 top-14 z-50 w-64 p-2 text-sm sm:absolute sm:right-0 sm:top-auto sm:mt-2" role="menu">
          {items.map(([to, icon, label]) => (
            <Link key={to} to={to} role="menuitem" className="flex min-h-11 items-center gap-3 rounded-lg px-3 hover:bg-white/5 focus-ring" onClick={() => setOpen(false)}>
              <span aria-hidden="true">{icon}</span>
              {label}
            </Link>
          ))}
          <p className="px-3 pb-1 pt-2 text-xs text-mute">Leaving is safe: your seat is kept on this phone if a game is running.</p>
        </div>
      )}
    </div>
  );
}

export function PrefsMenu() {
  const { prefs, set } = usePrefs();
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button className="btn btn-ghost !min-h-10 !px-3 !py-1.5 text-sm" aria-expanded={open} aria-label="Display and sound settings" onClick={() => setOpen((o) => !o)}>
        <span aria-hidden="true">{prefs.muted ? '🔇' : '🔊'}</span>
        <span className="sr-only sm:not-sr-only">Settings</span>
      </button>
      {open && (
        <div className="card absolute right-0 z-50 mt-2 w-64 space-y-1 p-3 text-sm" role="dialog" aria-label="Device settings">
          <Toggle label="Sound effects" checked={!prefs.muted} onChange={(v) => set({ muted: !v })} />
          {!prefs.muted && (
            <label className="flex min-h-11 items-center justify-between gap-3 px-2">
              <span>Volume</span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={prefs.volume}
                onChange={(e) => set({ volume: Number(e.target.value) })}
                onPointerUp={() => sounds.seal()}
                aria-label="Sound volume"
                className="w-28 accent-[#c9a45c]"
              />
            </label>
          )}
          <Toggle label="Vibration" hint="Buzz on phase changes (Android)" checked={prefs.vibration} onChange={(v) => set({ vibration: v })} />
          <Toggle label="Reduced motion" checked={prefs.reduceMotion} onChange={(v) => set({ reduceMotion: v })} />
          <Toggle label="Low-light mode (dim room)" checked={prefs.lowLight} onChange={(v) => set({ lowLight: v })} />
          <Toggle label="Keep screen awake in games" hint="Stops the phone locking mid-game (the #1 cause of dropped connections)" checked={prefs.keepAwake} onChange={(v) => set({ keepAwake: v })} />
          <Toggle label="Suspense music" hint="Plays at Dawn and Night in online Mafia games" checked={prefs.music} onChange={(v) => set({ music: v })} />
          <p className="pt-1 text-xs text-mute">Saved on this device only.</p>
        </div>
      )}
    </div>
  );
}

export function Toggle({ label, checked, onChange, hint, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string; disabled?: boolean }) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-2 py-1.5 hover:bg-white/5 ${disabled ? 'opacity-50' : ''}`}>
      <span>
        <span className="block">{label}</span>
        {hint && <span className="block text-xs text-mute">{hint}</span>}
      </span>
      <input type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className="relative h-6 w-11 shrink-0 rounded-full border border-line bg-black/50 transition peer-checked:border-gold peer-checked:bg-gold/30 peer-focus-visible:outline-2 peer-focus-visible:outline-gold after:absolute after:left-0.5 after:top-0.5 after:h-4.5 after:w-4.5 after:rounded-full after:bg-mute after:transition peer-checked:after:translate-x-5 peer-checked:after:bg-gold"
      />
    </label>
  );
}

// ------------------------------------------------------------------ modal

export function Modal({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('button, input, select, textarea')?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      prev?.focus();
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/75 p-4 backdrop-blur-sm" onClick={onClose}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className="card anim-fade-up w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-3 font-[family-name:var(--font-display)] text-lg text-gold">{title}</h2>
        {children}
      </div>
    </div>
  );
}

interface ConfirmState {
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
}

const ConfirmCtx = createContext<(o: Omit<ConfirmState, 'resolve'>) => Promise<boolean>>(async () => false);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const ask = useCallback((o: Omit<ConfirmState, 'resolve'>) => new Promise<boolean>((resolve) => setState({ ...o, resolve })), []);
  const close = (v: boolean) => {
    state?.resolve(v);
    setState(null);
  };
  return (
    <ConfirmCtx.Provider value={ask}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title ?? ''}>
        <p className="mb-5 text-mute">{state?.body}</p>
        <div className="flex justify-end gap-2">
          <button className="btn btn-ghost" onClick={() => close(false)}>
            Cancel
          </button>
          <button className={`btn ${state?.danger ? 'btn-primary' : 'btn-gold'}`} onClick={() => close(true)}>
            {state?.confirm}
          </button>
        </div>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
export const useConfirm = () => useContext(ConfirmCtx);

// ------------------------------------------------------------------ toast

const ToastCtx = createContext<(msg: string, tone?: 'ok' | 'error') => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: 'ok' | 'error' }[]>([]);
  const push = useCallback((msg: string, tone: 'ok' | 'error' = 'ok') => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-2), { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[90] flex flex-col items-center gap-2 px-4" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'} className={`anim-fade-up rounded-xl border px-4 py-2.5 text-sm shadow-xl ${t.tone === 'error' ? 'border-ember/60 bg-blood text-bone' : 'border-gold/40 bg-smoke text-bone'}`}>
            {t.msg}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ------------------------------------------------------------------ QR

export function QR({ text, size = 200 }: { text: string; size?: number }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    QRCode.toDataURL(text, { margin: 1, width: size * 2, color: { dark: '#0a0909', light: '#eee6d8' } }).then(setSrc, () => setSrc(''));
  }, [text, size]);
  if (!src) return <div style={{ width: size, height: size }} className="rounded-xl bg-smoke" />;
  return <img src={src} width={size} height={size} alt={`QR code to join: ${text}`} className="rounded-xl" />;
}

// ------------------------------------------------------------------ players & feed

export function PlayerRow({ p, right, sub, className = '' }: { p: PublicPlayer; right?: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <li data-player={p.name} className={`flex min-h-12 items-center justify-between gap-3 rounded-xl border border-line/60 px-3 py-2 ${p.alive ? 'bg-white/[0.02]' : 'bg-black/40 opacity-60'} ${className}`}>
      <div className="flex min-w-0 items-center gap-3">
        <span className="relative">
          <Avatar name={p.name} photo={p.photo} dead={!p.alive} size={38} />
          <span className={`absolute -bottom-0.5 -right-0.5 z-10 h-3 w-3 rounded-full border-2 border-coal ${p.connected ? 'bg-ok' : 'bg-ash'}`} title={p.connected ? 'Connected' : 'Disconnected'} aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <div className={`truncate font-medium ${p.alive ? '' : 'line-through decoration-ember/70'}`}>
            {p.name}
            {p.isHost && <span className="ml-2 text-xs text-gold">HOST</span>}
          </div>
          <div className="flex flex-wrap gap-x-2 text-xs text-mute">
            <span className="sr-only">{p.connected ? 'connected' : 'disconnected'}</span>
            {!p.alive && <span>☠ {p.deathCause === 'vote' ? 'Voted out' : p.deathCause === 'host' ? 'Removed' : 'Killed at night'}</span>}
            {p.silenced && <span className="text-gold">🤐 Silenced today</span>}
            {sub}
          </div>
        </div>
      </div>
      {right}
    </li>
  );
}

const LOBBY_KINDS = new Set(['join', 'room', 'kick']);

/** During a game, lobby chatter (joins, room opened) is left out of the announcements. */
export function Feed({ entries, limit = 30, inGame = false }: { entries: LogEntry[]; limit?: number; inGame?: boolean }) {
  const list = [...entries]
    .filter((e) => !inGame || !LOBBY_KINDS.has(e.kind))
    .reverse()
    .slice(0, limit);
  if (!list.length) return <p className="text-sm text-mute">Nothing has happened yet.</p>;
  return (
    <ol className="space-y-2" aria-label="Game announcements">
      {list.map((e) => (
        <li key={e.seq} className={`rounded-lg border-l-2 px-3 py-1.5 text-sm ${e.kind === 'gameover' ? 'border-gold bg-gold/10' : e.kind === 'morning' || e.kind === 'verdict' ? 'border-crimson bg-white/[0.02]' : e.kind === 'correction' || e.kind === 'gm' ? 'border-gold/60 bg-white/[0.02]' : 'border-line'}`}>
          <span className="mr-2 text-[0.65rem] uppercase tracking-wider text-mute">{e.round > 0 ? `R${e.round}` : ''}</span>
          {e.text}
        </li>
      ))}
    </ol>
  );
}

export function Section({ title, children, aside, className = '' }: { title: string; children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <section className={`card p-4 md:p-5 ${className}`}>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-sm tracking-[0.2em] text-gold uppercase">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export const PHASE_LABEL: Record<string, string> = {
  lobby: 'Lobby',
  reveal: 'Role Reveal',
  prenight: 'Dawn',
  night: 'Night',
  morning: 'Morning',
  discussion: 'Day',
  voting: 'Vote',
  verdict: 'Verdict',
  game_over: 'Game Over',
};
