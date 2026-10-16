/** Bollywood-flavoured line art for Dumb Charades (clapperboard, film reel, spotlight). */

export function Clapper({ size = 120, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 120 110" width={size} height={size * (110 / 120)} className={className} aria-hidden="true">
      <defs>
        <linearGradient id="clap-body" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3a0f3f" />
          <stop offset="100%" stopColor="#1a0620" />
        </linearGradient>
      </defs>
      <g className="clap-arm" style={{ transformOrigin: '14px 40px' }}>
        <path d="M14 40 L104 22 L108 38 L18 56 Z" fill="#fff4d6" stroke="#ffb300" strokeWidth="2.5" strokeLinejoin="round" />
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={`M${26 + i * 18} ${37.6 - i * 3.6} l10 -2 l6 15 l-10 2 z`} fill="#e5196f" />
        ))}
      </g>
      <rect x="14" y="52" width="94" height="50" rx="6" fill="url(#clap-body)" stroke="#ffb300" strokeWidth="2.5" />
      <path d="M14 60h94" stroke="#ffb300" strokeWidth="2" />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${20 + i * 18} 52 l10 0 l-6 8 l-10 0 z`} fill="#fff4d6" />
      ))}
      <path d="M24 74h40M24 84h56M24 94h30" stroke="#ffcf6b" strokeWidth="2.5" strokeLinecap="round" opacity="0.8" />
      <circle cx="94" cy="86" r="8" fill="none" stroke="#e5196f" strokeWidth="2.5" />
      <path d="M90 86h8M94 82v8" stroke="#e5196f" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Reel({ size = 64, className = '' }: { size?: number; className?: string }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} className={className} aria-hidden="true">
      <g fill="none" stroke="#ffb300" strokeWidth="2.4">
        <circle cx="32" cy="32" r="28" />
        <circle cx="32" cy="32" r="5" fill="#ffb300" />
        {[0, 72, 144, 216, 288].map((a) => (
          <circle key={a} cx={32 + 15 * Math.cos((a * Math.PI) / 180)} cy={32 + 15 * Math.sin((a * Math.PI) / 180)} r="6.5" stroke="#e5196f" />
        ))}
      </g>
    </svg>
  );
}
