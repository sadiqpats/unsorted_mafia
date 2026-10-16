import type { ReactElement } from 'react';

/**
 * Line illustrations for the guide, drawn in the same gold-on-dark style as the
 * role emblems. Moving parts use the `ga-*` classes in index.css, which switch
 * off under reduced motion.
 */
const G = '#e2c27d';
const DIM = '#8a7243';
const RED = '#b0202a';

const SCENES: Record<string, ReactElement> = {
  // ---------- what you need
  phone: (
    <>
      <rect x="44" y="12" width="32" height="56" rx="6" />
      <path d="M56 17h8" />
      <rect x="49" y="24" width="22" height="30" rx="2" stroke={DIM} />
      <path d="M54 44l4-8 4 5 3-3 3 6" stroke={DIM} />
      <circle cx="60" cy="61" r="2" />
      <g className="ga-float">
        <path d="M84 22c4 3 4 9 0 12M90 18c7 5 7 15 0 20" stroke={DIM} />
      </g>
    </>
  ),
  host: (
    <>
      <rect x="26" y="22" width="68" height="40" rx="3" />
      <path d="M18 66h84l-6 5H24z" />
      <path d="M36 34h20M36 41h30M36 48h14" stroke={DIM} />
      <rect x="72" y="32" width="14" height="14" rx="2" stroke={DIM} />
      <g className="ga-float" fill={G} fillOpacity="0.15">
        <path d="M48 12l5 5 7-8 7 8 5-5-2 10H50z" />
      </g>
    </>
  ),
  tv: (
    <>
      <rect x="18" y="14" width="84" height="48" rx="3" />
      <path d="M50 70h20M60 62v8" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x={26 + i * 18} y="22" width="14" height="16" rx="1.5" stroke={DIM} />
          <circle cx={33 + i * 18} cy="28" r="2.6" stroke={DIM} />
          <path d={`M${29 + i * 18} 36c1-3 7-3 8 0`} stroke={DIM} />
        </g>
      ))}
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={26 + i * 18} y="42" width="14" height="14" rx="1.5" stroke={DIM} />
      ))}
      <path className="ga-cut" d="M44 20l-2 20" stroke={RED} strokeWidth="2.6" />
    </>
  ),
  crowd: (
    <>
      {[
        [30, 40, 0.6],
        [90, 40, 0.6],
        [45, 34, 0.85],
        [75, 34, 0.85],
        [60, 30, 1],
      ].map(([x, y, o], i) => (
        <g key={i} opacity={o} className={i === 4 ? 'ga-float' : undefined}>
          <circle cx={x} cy={y} r="7" />
          <path d={`M${x - 12} ${y + 30}c0-12 5-18 12-18s12 6 12 18`} />
        </g>
      ))}
    </>
  ),
  clock: (
    <>
      <circle cx="60" cy="40" r="26" />
      <circle cx="60" cy="40" r="21" stroke={DIM} strokeDasharray="1.5 4" />
      <path d="M60 40V24" />
      <g className="ga-spin" style={{ transformOrigin: '60px 40px' }}>
        <path d="M60 40l12 7" />
      </g>
      <circle cx="60" cy="40" r="2" fill={G} />
      <path d="M52 10h16M60 10v4" />
    </>
  ),

  // ---------- setup steps
  createRoom: (
    <>
      <rect x="20" y="16" width="62" height="40" rx="3" />
      <path d="M14 60h74l-5 5H19z" />
      <text x="51" y="41" textAnchor="middle" fill={G} stroke="none" fontSize="11" fontFamily="Cinzel, serif" letterSpacing="2">
        ABCDE
      </text>
      <g className="ga-float">
        <circle cx="96" cy="26" r="7" />
        <path d="M96 33v18M96 42h5M96 47h4" />
      </g>
    </>
  ),
  scan: (
    <>
      <rect x="14" y="14" width="44" height="44" rx="3" />
      {[
        [18, 18],
        [42, 18],
        [18, 42],
      ].map(([x, y], i) => (
        <rect key={i} x={x} y={y} width="12" height="12" rx="1" fill={G} fillOpacity="0.25" />
      ))}
      <path d="M36 22h2M34 30h6M42 34h4M36 40h2M46 46h6M40 50h2M50 38h4" strokeWidth="3" />
      <path className="ga-scan" d="M12 20h48" stroke={RED} strokeWidth="2" />
      <path d="M64 36h8M68 32l4 4-4 4" stroke={DIM} />
      <rect x="78" y="12" width="30" height="52" rx="5" />
      <path d="M89 17h8" />
      <circle cx="93" cy="58" r="1.8" />
      <path d="M84 32l5 5 9-10" className="ga-pop" />
    </>
  ),
  selfie: (
    <>
      <rect x="40" y="10" width="40" height="60" rx="6" />
      <circle cx="60" cy="16" r="1.8" />
      <circle cx="60" cy="36" r="9" />
      <path d="M46 60c0-10 6-14 14-14s14 4 14 14" />
      <path d="M55 37c2 2 8 2 10 0" stroke={DIM} />
      <g className="ga-flash">
        <path d="M92 18l4-8M98 26l8-3M94 34l7 3" stroke={G} />
        <path d="M28 18l-4-8M22 26l-8-3M26 34l-7 3" stroke={G} />
      </g>
    </>
  ),
  pickRoles: (
    <>
      {[
        [-16, 30],
        [0, 22],
        [16, 30],
      ].map(([r, y], i) => (
        <g key={i} transform={`rotate(${r} 60 70)`}>
          <rect x="44" y={y - 8} width="32" height="46" rx="4" fill="#160f10" stroke={i === 1 ? G : DIM} />
          <circle cx="60" cy={y + 10} r="7" stroke={i === 1 ? G : DIM} />
        </g>
      ))}
      <g className="ga-float">
        <circle cx="96" cy="20" r="7" />
        <path d="M93 20h6M96 17v6" />
        <circle cx="24" cy="20" r="7" />
        <path d="M21 20h6" />
      </g>
    </>
  ),
  holdReveal: (
    <>
      <rect x="36" y="10" width="48" height="62" rx="5" fill="#160f10" />
      <g className="ga-reveal">
        <circle cx="60" cy="32" r="10" stroke={G} />
        <path d="M54 34c3-6 9-6 12 0M52 30c5 1 11 1 16 0" stroke={G} />
        <path d="M48 52h24M52 58h16" stroke={DIM} />
      </g>
      <circle className="ga-ring" cx="60" cy="58" r="8" stroke={RED} />
      <path d="M62 86V66c0-3 5-3 5 0v6c0-3 5-3 5 0v2c0-3 5-3 5 0v8c0 6-4 10-9 10" stroke={G} />
      <path d="M62 72c-3-2-7 0-5 4l5 10" stroke={G} />
    </>
  ),

  // ---------- the round
  dawn: (
    <>
      <path d="M8 58h104" />
      <g className="ga-rise">
        <path d="M36 58a24 24 0 0 1 48 0" fill={G} fillOpacity="0.12" />
        {[-60, -30, 0, 30, 60].map((a) => (
          <path key={a} d="M60 26v-8" transform={`rotate(${a} 60 58)`} stroke={DIM} />
        ))}
      </g>
      <path d="M20 66h20M50 72h30M86 66h14" stroke={DIM} />
    </>
  ),
  night: (
    <>
      <path className="ga-float" d="M72 14a20 20 0 1 0 18 30 16 16 0 1 1-18-30z" fill={G} fillOpacity="0.15" />
      {[
        [22, 18],
        [36, 30],
        [16, 40],
        [98, 18],
        [104, 34],
      ].map(([x, y], i) => (
        <path key={i} className="ga-twinkle" style={{ animationDelay: `${i * 0.45}s` }} d={`M${x} ${y - 3}v6M${x - 3} ${y}h6`} />
      ))}
      <path d="M18 74V58l10-8 10 8v16M44 74V54l12-10 12 10v20M74 74V60l9-7 9 7v14" stroke={DIM} />
      <rect className="ga-twinkle" x="53" y="60" width="6" height="6" fill={G} fillOpacity="0.5" stroke="none" />
    </>
  ),
  day: (
    <>
      <g className="ga-spin-slow" style={{ transformOrigin: '86px 22px' }}>
        {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => (
          <path key={a} d="M86 8v-5" transform={`rotate(${a} 86 22)`} stroke={DIM} />
        ))}
      </g>
      <circle cx="86" cy="22" r="9" fill={G} fillOpacity="0.15" />
      <path d="M22 46h46v28H22z" />
      <path d="M36 46v-4h18v4" />
      <path d="M32 58h26" stroke={DIM} />
      <g className="ga-drop">
        <rect x="38" y="20" width="14" height="18" rx="1" fill="#160f10" />
        <path d="M42 26h6M42 31h4" stroke={DIM} />
      </g>
    </>
  ),
};

export type GuideScene = keyof typeof SCENES;

export function GuideArt({ scene, className = '', label }: { scene: string; className?: string; label?: string }) {
  return (
    <svg viewBox="0 0 120 90" className={className} role={label ? 'img' : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <g fill="none" stroke={G} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {SCENES[scene]}
      </g>
    </svg>
  );
}
