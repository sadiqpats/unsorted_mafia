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

/**
 * Bollywood Mafia Night portraits (same gold line style). Faces are drawn inside the
 * medallion: head ~ centre (32, 30), shoulders at the bottom.
 */
const BW: Record<string, ReactElement> = {
  // Gabbar: wild hair, heavy brows, thick beard, ammo belt across the chest.
  'bw-gabbar': (
    <>
      <path d="M20 26c0-9 6-14 12-14s12 5 12 14" />
      <path d="M18 24c1-4 3-6 5-7M46 24c-1-4-3-6-5-7M24 14l2 3M32 12v3M40 14l-2 3" />
      <path d="M24 26l6 2M40 26l-6 2" strokeWidth="2.8" />
      <circle cx="27.5" cy="30" r="1.2" fill="#e2c27d" />
      <circle cx="36.5" cy="30" r="1.2" fill="#e2c27d" />
      <path d="M22 32c0 10 4 15 10 15s10-5 10-15" />
      <path d="M25 37c2 1 4 1 7 0 3 1 5 1 7 0" />
      <path d="M26 41c2 3 10 3 12 0" opacity="0.7" />
      <path d="M14 58l36-12" strokeWidth="3.2" />
      {[18, 24, 30, 36, 42].map((x, i) => (
        <path key={x} d={`M${x} ${56.7 - i * 2} l1.6 4`} strokeWidth="1.6" />
      ))}
    </>
  ),
  // Badde Sahab: slicked hair, dark glasses, cigar with smoke, bow tie.
  'bw-baddesahab': (
    <>
      <path d="M21 28c0-10 5-15 11-15s11 5 11 15" />
      <path d="M21 22c4-5 10-6 22-1" />
      <rect x="22.5" y="27" width="8" height="5" rx="2" fill="#e2c27d" fillOpacity="0.35" />
      <rect x="33.5" y="27" width="8" height="5" rx="2" fill="#e2c27d" fillOpacity="0.35" />
      <path d="M30.5 29h3" />
      <path d="M22 31c0 9 4 14 10 14s10-5 10-14" />
      <path d="M28 39h7" />
      <path d="M35 39h9" strokeWidth="2.6" />
      <path d="M46 37c2-2 0-4 2-6M49 35c2-2 0-4 2-6" opacity="0.6" />
      <path d="M26 50l6 3 6-3-6-2z" fill="#e2c27d" fillOpacity="0.3" />
      <path d="M16 58c3-6 9-9 16-9s13 3 16 9" />
    </>
  ),
  // Gao Wallon: turban, big moustache, lathi.
  'bw-gaowallon': (
    <>
      <path d="M19 25c0-7 6-11 13-11s13 4 13 11c-4-2-9-3-13-3s-9 1-13 3z" fill="#e2c27d" fillOpacity="0.25" />
      <path d="M21 19c5 2 17 2 22 0M23 15c4 1 14 1 18 0" opacity="0.7" />
      <path d="M43 18c4-1 6 1 6 4" />
      <circle cx="27.5" cy="30" r="1.2" fill="#e2c27d" />
      <circle cx="36.5" cy="30" r="1.2" fill="#e2c27d" />
      <path d="M21 26c0 12 5 18 11 18s11-6 11-18" />
      <path d="M24 37c3-3 5-2 8-1 3-1 5-2 8 1" strokeWidth="2.8" />
      <path d="M14 58c3-6 9-9 18-9s15 3 18 9" />
      <path d="M50 22l-2 36" strokeWidth="2.6" />
    </>
  ),
  // Baburao: round spectacles, bald top with side hair, moustache, vest.
  'bw-baburao': (
    <>
      <path d="M21 30c0-11 5-16 11-16s11 5 11 16" />
      <path d="M20 26c-2 1-2 4 0 6M44 26c2 1 2 4 0 6" />
      <circle cx="27" cy="30" r="4" />
      <circle cx="37" cy="30" r="4" />
      <path d="M31 30h2" />
      <circle cx="27" cy="30" r="1" fill="#e2c27d" />
      <circle cx="37" cy="30" r="1" fill="#e2c27d" />
      <path d="M22 32c0 9 4 13 10 13s10-4 10-13" />
      <path d="M26 38c2-2 4-2 6-1 2-1 4-1 6 1" strokeWidth="2.4" />
      <path d="M29 42c2 1 4 1 6 0" opacity="0.7" />
      <path d="M16 58c3-6 8-9 16-9s13 3 16 9" />
      <path d="M26 49l2 9M38 49l-2 9" opacity="0.7" />
    </>
  ),
  // Babaji: hair bun, tilak, long flowing beard, rudraksha beads.
  'bw-babaji': (
    <>
      <circle cx="32" cy="11" r="4" />
      <path d="M21 27c0-9 5-13 11-13s11 4 11 13" />
      <path d="M30 19v6M34 19v6M28.5 21.5h7" stroke="#e0473f" />
      <circle cx="27.5" cy="29" r="1.2" fill="#e2c27d" />
      <circle cx="36.5" cy="29" r="1.2" fill="#e2c27d" />
      <path d="M21 30c0 8 2 18 11 24 9-6 11-16 11-24" />
      <path d="M26 35c2 1 4 1 6 0 2 1 4 1 6 0" />
      <path d="M28 41l1 8M32 41v10M36 41l-1 8" opacity="0.6" />
      {[16, 20, 24, 40, 44, 48].map((x) => (
        <circle key={x} cx={x} cy={x < 32 ? 50 + (x - 16) / 2 : 56 - (x - 40) / 2} r="1.4" fill="#e2c27d" />
      ))}
    </>
  ),
  // Munna MBBS: curly hair, easy grin, stethoscope round the neck.
  'bw-munna': (
    <>
      <path d="M21 26c-1-6 1-10 4-11 1-3 4-3 6-2 2-2 6-1 7 1 3 0 6 4 5 12" />
      <path d="M24 18c1 1 2 1 3 0M31 16c1 1 2 1 3 0M37 18c1 1 2 1 3 0" opacity="0.7" />
      <circle cx="27.5" cy="29" r="1.2" fill="#e2c27d" />
      <circle cx="36.5" cy="29" r="1.2" fill="#e2c27d" />
      <path d="M21 27c0 10 5 16 11 16s11-6 11-16" />
      <path d="M26 36c3 3 9 3 12 0" />
      <path d="M16 58c3-6 8-9 16-9s13 3 16 9" />
      <path d="M24 47c0 6 3 9 8 9s8-3 8-9" stroke="#e0473f" />
      <circle cx="32" cy="57" r="2" stroke="#e0473f" />
    </>
  ),
  // ACP Pradyuman: police cap with badge, moustache, the famous hand gesture.
  'bw-acp': (
    <>
      <path d="M18 20c4-6 24-6 28 0l-3 4H21z" fill="#e2c27d" fillOpacity="0.25" />
      <path d="M20 24h24" strokeWidth="2.6" />
      <circle cx="32" cy="17" r="2" fill="#e2c27d" />
      <circle cx="27.5" cy="30" r="1.2" fill="#e2c27d" />
      <circle cx="36.5" cy="30" r="1.2" fill="#e2c27d" />
      <path d="M22 26c0 10 4 16 10 16s10-6 10-16" />
      <path d="M25 37c3-2 5-2 7-1 2-1 4-1 7 1" strokeWidth="2.6" />
      <path d="M16 58c3-6 8-9 16-9s13 3 16 9" />
      <path d="M46 44v-8M49 44v-9M52 45v-6" strokeWidth="2.2" />
      <path d="M44 46c2 4 7 4 9 0" />
    </>
  ),
  // Bunty: backwards cap, shades, cheeky grin, money bag.
  'bw-bunty': (
    <>
      <path d="M21 24c1-7 6-10 11-10s10 3 11 10z" fill="#e2c27d" fillOpacity="0.25" />
      <path d="M21 24c-3 0-5 1-6 2" strokeWidth="2.4" />
      <path d="M22 28h20" />
      <path d="M23 28c0 3 2 4 4 4s4-1 4-4M33 28c0 3 2 4 4 4s4-1 4-4" fill="#e2c27d" fillOpacity="0.4" />
      <path d="M22 30c0 9 4 14 10 14s10-5 10-14" />
      <path d="M27 38c2 2 6 2 9-1" />
      <path d="M16 58c3-6 8-9 16-9s13 3 16 9" />
      <path d="M46 46c-3 2-4 6-2 9 2 3 8 3 10 0 2-3 1-7-2-9" />
      <path d="M47 45l2-2 2 2" />
      <path d="M49 50v4M48 51h2.5" strokeWidth="1.4" />
    </>
  ),
  // Pradhan Ji: Gandhi cap, round specs, moustache, gamchha over the shoulder.
  'bw-pradhan': (
    <>
      <path d="M21 21l3-6h16l3 6z" fill="#e2c27d" fillOpacity="0.25" />
      <path d="M21 21h22" />
      <circle cx="27.5" cy="29" r="3.2" />
      <circle cx="36.5" cy="29" r="3.2" />
      <path d="M30.7 29h2.6" />
      <path d="M22 25c0 11 4 17 10 17s10-6 10-17" />
      <path d="M26 36c2-2 4-2 6-1 2-1 4-1 6 1" strokeWidth="2.4" />
      <path d="M16 58c3-6 8-9 16-9s13 3 16 9" />
      <path d="M22 49l14 9M27 47l14 9" stroke="#e0473f" opacity="0.8" />
    </>
  ),
};

const RING: Record<Alignment | 'none', string> = {
  good: '#c9a45c',
  mafia: '#b0202a',
  evil: '#8e2f7a',
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
        {ART[art] ?? BW[art] ?? ART.unknown}
      </g>
    </svg>
  );
}
