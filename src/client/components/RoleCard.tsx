import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from 'react';
import { ABILITIES, BOLLYWOOD, ROLES, roleArt, themeText } from '../../shared/roles';
import type { Settings } from '../../shared/settings';
import type { Alignment, StolenAbility } from '../../shared/types';
import { AlignmentBadge } from './ui';
import { RoleArt } from './RoleArt';

export function RoleDetails({
  roleId,
  alignment,
  abilities,
  stolen,
  settings,
  compact = false,
}: {
  roleId: string;
  alignment: Alignment;
  abilities?: { abilityId: string; source: string; charges: number | null }[];
  stolen?: StolenAbility | null;
  settings?: Settings;
  compact?: boolean;
}) {
  const role = ROLES[roleId];
  if (!role) return null;
  const bw = settings?.bollywood ? BOLLYWOOD[roleId] : undefined;
  const t = (x: string) => themeText(x, settings);
  return (
    <div className="flex flex-col items-center text-center">
      <RoleArt art={roleArt(roleId, settings)} alignment={alignment} size={compact ? 84 : 120} />
      <h3 className="brand-title mt-3 text-3xl font-bold">{bw ? bw.name : role.name}</h3>
      {bw && <p className="text-sm text-mute">({role.name})</p>}
      <div className="mt-2">
        <AlignmentBadge alignment={alignment} />
      </div>
      <p className="mt-2 font-[family-name:var(--font-serif)] text-lg italic text-mute">“{t(role.tagline)}”</p>
      {!compact && <p className="mt-3 text-sm text-bone/90">{t(role.description)}</p>}
      <dl className="mt-4 w-full space-y-3 text-left text-sm">
        <div className="rounded-xl border border-line/70 bg-black/30 p-3">
          <dt className="eyebrow mb-1 !text-[0.62rem]">Ability</dt>
          <dd>
            {t(role.abilityText)}
            {roleId === 'judge' && settings && <span className="text-gold"> (×{settings.judgeWeight} this game)</span>}
          </dd>
        </div>
        {!compact && (
          <div className="rounded-xl border border-line/70 bg-black/30 p-3">
            <dt className="eyebrow mb-1 !text-[0.62rem]">How to use it</dt>
            <dd>{t(role.howTo)}</dd>
          </div>
        )}
        <div className="rounded-xl border border-line/70 bg-black/30 p-3">
          <dt className="eyebrow mb-1 !text-[0.62rem]">Win condition</dt>
          <dd>{t(role.winCondition)}</dd>
        </div>
        {abilities && abilities.some((a) => a.charges !== null || a.source === 'stolen') && (
          <div className="rounded-xl border border-gold/30 bg-gold/5 p-3">
            <dt className="eyebrow mb-1 !text-[0.62rem]">Your powers</dt>
            <dd className="space-y-1">
              {abilities.map((a) => (
                <div key={a.abilityId} className="flex justify-between gap-2">
                  <span>
                    {ABILITIES[a.abilityId]?.name ?? a.abilityId}
                    {a.source === 'stolen' && <span className="ml-1 text-xs text-neutral">(stolen)</span>}
                  </span>
                  <span className="tabular-nums text-mute">{a.charges === null ? 'unlimited' : `${a.charges} left`}</span>
                </div>
              ))}
              {stolen && stolen.duration === 'oneUse' && <p className="text-xs text-mute">Stolen powers work once.</p>}
            </dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function CardBack({ hint }: { hint: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 rounded-[1.4rem] border border-gold/40 bg-[radial-gradient(circle_at_50%_30%,#3a1012,#0b0909_70%)] p-6 text-center shadow-2xl">
      <img src="/brand/unsorted-wordmark-light.png" alt="Unsorted" className="h-auto w-32" draggable={false} />
      <svg viewBox="0 0 64 64" width="96" height="96" aria-hidden="true" className="anim-drift">
        <circle cx="32" cy="32" r="30" fill="none" stroke="#c9a45c" strokeOpacity="0.6" />
        <path d="M14 40c6 3 30 3 36 0" stroke="#c9a45c" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <path d="M20 39l3-15c1-4 17-4 18 0l3 15" fill="#7d1416" stroke="#c9a45c" strokeWidth="2" />
        <path d="M21 33h22" stroke="#c9a45c" strokeWidth="2" />
      </svg>
      <div className="brand-title text-2xl font-bold">Mafia Night</div>
      <p className="text-sm text-mute">{hint}</p>
    </div>
  );
}

/**
 * Press-and-hold to reveal. Releasing (or switching apps) hides it again, so a
 * glance over the shoulder only ever sees the card back.
 */
export function HoldToReveal({ children, hint = 'Press and hold to reveal — release to hide', minHeight = 560 }: { children: ReactNode; hint?: string; minHeight?: number }) {
  const [shown, setShown] = useState(false);
  const [tapMode, setTapMode] = useState(false);
  useEffect(() => {
    const hide = () => setShown(false);
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('blur', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('blur', hide);
    };
  }, []);
  useEffect(() => {
    if (!shown || !tapMode) return;
    const t = setTimeout(() => setShown(false), 8000);
    return () => clearTimeout(t);
  }, [shown, tapMode]);
  const holdProps = tapMode
    ? { onClick: () => setShown((s) => !s) }
    : {
        onPointerDown: (e: PointerEvent) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          setShown(true);
        },
        onPointerUp: () => setShown(false),
        onPointerCancel: () => setShown(false),
        onPointerLeave: () => setShown(false),
        onKeyDown: (e: KeyboardEvent) => (e.key === ' ' || e.key === 'Enter') && (e.preventDefault(), setShown(true)),
        onKeyUp: () => setShown(false),
        onContextMenu: (e: MouseEvent) => e.preventDefault(),
      };
  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        aria-pressed={shown}
        aria-label={shown ? 'Your secret card (release to hide)' : hint}
        className={`flip focus-ring w-full select-none rounded-[1.4rem] ${tapMode ? '' : 'touch-none'} ${shown ? 'is-flipped' : ''}`}
        style={{ minHeight, WebkitTouchCallout: 'none' }}
        {...holdProps}
      >
        <div className="flip-inner" style={{ minHeight }}>
          <div className="flip-face">
            <CardBack hint={tapMode ? 'Tap to reveal — tap again to hide' : hint} />
          </div>
          <div className="flip-face flip-back overflow-y-auto rounded-[1.4rem] border border-gold/40 bg-coal p-5 scrollbar-thin">{shown && children}</div>
        </div>
      </div>
      <label className="mt-3 flex items-center justify-center gap-2 text-xs text-mute">
        <input type="checkbox" checked={tapMode} onChange={(e) => setTapMode(e.target.checked)} className="h-4 w-4 accent-[#c9a45c]" />
        Tap instead of hold (accessibility — auto-hides after 8s)
      </label>
    </div>
  );
}

/**
 * ANTI-CHEAT privacy shield. Every player — with or without a power — sees the
 * exact same closed shield and must open it to act, so neighbours cannot tell
 * who has an ability. It closes automatically after inactivity, when the phone
 * is locked, or when the app goes to the background.
 */
export function PrivacyShield({ children, label = 'Open your secret panel', autoHideSec = 15, onOpenChange }: { children: ReactNode; label?: string; autoHideSec?: number; onOpenChange?: (o: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const arm = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), autoHideSec * 1000);
  };
  useEffect(() => {
    onOpenChange?.(open);
    if (open) arm();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [open]);
  useEffect(() => {
    const hide = () => document.visibilityState === 'hidden' && setOpen(false);
    document.addEventListener('visibilitychange', hide);
    return () => document.removeEventListener('visibilitychange', hide);
  }, []);
  if (!open) {
    return (
      <button className="card flex min-h-56 w-full flex-col items-center justify-center gap-3 border-dashed p-6 text-center focus-ring" onClick={() => setOpen(true)}>
        <span className="text-4xl" aria-hidden="true">
          🕯️
        </span>
        <span className="font-[family-name:var(--font-display)] text-lg tracking-wider text-gold">{label}</span>
      </button>
    );
  }
  return (
    <div className="card relative p-4" onPointerDown={arm} onKeyDown={arm}>
      <button className="btn btn-ghost absolute right-3 top-3 !min-h-9 !px-3 !py-1 text-xs" onClick={() => setOpen(false)}>
        Hide
      </button>
      {children}
    </div>
  );
}
