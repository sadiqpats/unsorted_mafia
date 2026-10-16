import type { ReactElement } from 'react';
import type { Alignment } from '../../shared/types';

/** Hand-drawn line emblems for each character. Gold strokes on a dark medallion. */
const ART: Record<string, ReactElement> = {
  fedora: (
    <>
      <path d="M10 42c8 5 36 5 44 0" />
      <path d="M17 41l4-17c1.5-5 20.5-5 22 0l4 17" />
      <path d="M19 34c8 2.5 18 2.5 26 0" strokeWidth="3.2" />
      <path d="M28 21c1.5 2 6.5 2 8 0" />
    </>
  ),
  lens: (
    <>
      <circle cx="28" cy="28" r="12" />
      <circle cx="28" cy="28" r="7" opacity="0.5" />
      <path d="M37 37l12 12" strokeWidth="4" />
      <path d="M23 24c1.5-2 3.5-3 6-3" />
    </>
  ),
  cross: (
    <>
      <path d="M27 14h10v13h13v10H37v13H27V37H14V27h13z" />
      <circle cx="32" cy="32" r="22" opacity="0.35" />
    </>
  ),
  gavel: (
    <>
      <path d="M22 16l14 14M30 10l14 14" />
      <path d="M26 13l8-8 14 14-8 8z" />
      <path d="M33 27L16 44" strokeWidth="4" />
      <path d="M12 52h26" />
      <path d="M16 52v-4h18v4" />
    </>
  ),
  mask: (
    <>
      <path d="M8 28c6-6 16-6 24 0 8-6 18-6 24 0-1 9-7 14-13 13-5-1-7-5-11-5s-6 4-11 5C15 42 9 37 8 28z" />
      <path d="M17 31c2-2 6-2 8 0M39 31c2-2 6-2 8 0" />
      <path d="M22 46l-2 6M42 46l2 6" opacity="0.6" />
    </>
  ),
  // Godfather: the puppet master — a hand on the control bar, strings down to a little figure.
  puppet: (
    <>
      <path d="M25 17v-3.5c0-1.4 2.6-1.4 2.6 0V12c0-1.4 2.7-1.4 2.7 0v-.5c0-1.4 2.7-1.4 2.7 0v1c0-1.4 2.6-1.4 2.6 0V17z" />
      <path d="M14 20h36" strokeWidth="3" />
      <path d="M32 17v10" strokeWidth="3" />
      <path d="M18 20l10 21M46 20l-10 21M32 27v11" strokeWidth="1.3" opacity="0.85" />
      <circle cx="32" cy="42" r="4" />
      <path d="M32 46v7M27 49l5-2 5 2M29 56l3-3 3 3" />
    </>
  ),
  // Villager: a cottage with a lit window.
  cottage: (
    <>
      <path d="M12 31L32 15l20 16" />
      <path d="M17 27v24h30V27" />
      <path d="M28 51V41h8v10" />
      <rect x="20" y="31" width="7" height="6" className="anim-flicker" />
      <path d="M41 22v-6h4v9" />
      <path d="M42 12c0-2 2-2 2-4" opacity="0.6" />
    </>
  ),
  // Joker: a playing card with a sinister grin.
  joker: (
    <>
      <rect x="18" y="11" width="28" height="42" rx="4" />
      <path d="M21.5 15.5v3.5c0 1.6-2.4 1.6-2.4 0" strokeWidth="1.5" />
      <path d="M23 30l2.5-10 4 5.5 2.5-8 2.5 8 4-5.5 2.5 10z" />
      <circle cx="25.5" cy="19" r="1.4" />
      <circle cx="32" cy="16.5" r="1.4" />
      <circle cx="38.5" cy="19" r="1.4" />
      <path d="M26 35l4 1.5M38 35l-4 1.5" />
      <path d="M23.5 41c3 6 14 6 17 0" />
      <path d="M26 43.5l1.4 1.6M30 45v1.8M34 45v1.8M38 43.5l-1.4 1.6" strokeWidth="1.3" />
    </>
  ),
  imposter: (
    <>
      <path d="M16 18c10-6 22-6 32 0v14c0 12-7 20-16 22-9-2-16-10-16-22z" />
      <path d="M32 12v42" opacity="0.6" />
      <path d="M21 29c2-2 5-2 7 0M36 29c2-2 5-2 7 0" />
      <path d="M22 42c3 3 7 3 10 0" />
      <path d="M36 44c2-2 5-2 7 0" />
    </>
  ),
  unknown: (
    <>
      <path d="M24 24c0-5 4-8 8-8s8 3 8 7c0 6-8 6-8 12" />
      <circle cx="32" cy="44" r="1.8" />
    </>
  ),
};

const RING: Record<Alignment | 'none', string> = {
  good: '#c9a45c',
  mafia: '#b0202a',
  neutral: '#9d8ccc',
  none: '#5a4f4a',
};

export function RoleArt({ art, alignment, size = 96, className = '' }: { art: string; alignment?: Alignment | null; size?: number; className?: string }) {
  const ring = RING[alignment ?? 'none'];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <defs>
        <radialGradient id={`bg-${art}`} cx="50%" cy="35%" r="70%">
          <stop offset="0%" stopColor="#2b2324" />
          <stop offset="100%" stopColor="#0b090a" />
        </radialGradient>
      </defs>
      <circle cx="32" cy="32" r="31" fill={`url(#bg-${art})`} stroke={ring} strokeWidth="1.2" />
      <circle cx="32" cy="32" r="27.5" fill="none" stroke={ring} strokeOpacity="0.35" strokeWidth="0.6" strokeDasharray="1.5 2.5" />
      <g fill="none" stroke="#e2c27d" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {ART[art] ?? ART.unknown}
      </g>
    </svg>
  );
}
