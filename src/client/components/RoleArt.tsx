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
  rose: (
    <>
      <path d="M32 26c-5 0-8-3-8-7s4-7 8-5c4-2 8 1 8 5s-3 7-8 7z" />
      <path d="M28 18c2 3 6 3 8 0M30 14c1 3 3 4 5 2" />
      <path d="M32 26v24" />
      <path d="M32 38c-4-4-9-3-11 0 3 3 8 3 11 0zM32 44c4-4 9-3 11 0-3 3-8 3-11 0z" />
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
  shield: (
    <>
      <path d="M32 10l18 6v12c0 12-8 21-18 26-10-5-18-14-18-26V16z" />
      <path d="M32 22l2.8 5.8 6.2.9-4.5 4.4 1 6.3-5.5-3-5.5 3 1-6.3-4.5-4.4 6.2-.9z" />
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
  lantern: (
    <>
      <path d="M26 12h12M32 8v4" />
      <path d="M24 16h16l-2 4H26z" />
      <path d="M26 20c-3 6-3 18 0 26h12c3-8 3-20 0-26" />
      <path d="M32 26c-3 4-3 8 0 12 3-4 3-8 0-12z" className="anim-flicker" />
      <path d="M24 50h16" />
    </>
  ),
  mask: (
    <>
      <path d="M8 28c6-6 16-6 24 0 8-6 18-6 24 0-1 9-7 14-13 13-5-1-7-5-11-5s-6 4-11 5C15 42 9 37 8 28z" />
      <path d="M17 31c2-2 6-2 8 0M39 31c2-2 6-2 8 0" />
      <path d="M22 46l-2 6M42 46l2 6" opacity="0.6" />
    </>
  ),
  candle: (
    <>
      <path d="M32 10c-4 5-4 9 0 12 4-3 4-7 0-12z" className="anim-flicker" />
      <path d="M26 24h12v26H26z" />
      <path d="M26 30c3 2 9 2 12 0" opacity="0.6" />
      <path d="M18 50h28" />
    </>
  ),
  jester: (
    <>
      <path d="M14 40c2-10 6-20 18-22 12 2 16 12 18 22" />
      <path d="M32 18c-4-6-12-8-18-4 4 2 6 6 6 10M32 18c4-6 12-8 18-4-4 2-6 6-6 10M32 18v-6" />
      <circle cx="14" cy="14" r="2.5" />
      <circle cx="50" cy="14" r="2.5" />
      <circle cx="32" cy="10" r="2.5" />
      <path d="M12 40h40l-4 8H16z" />
      <path d="M22 44h2M31 44h2M40 44h2" />
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
