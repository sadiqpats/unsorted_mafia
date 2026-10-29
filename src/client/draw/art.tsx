/** A little pencil-and-magnifier mark, drawn rather than emoji, so it looks the same everywhere. */
export function DrawMark({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden="true" className="draw-mark">
      <circle cx="48" cy="48" r="44" fill="#f5ecd9" stroke="#c9a45c" strokeWidth="3" />
      <path d="M22 66c8-4 14-16 22-15s7 12 15 10 9-14 15-16" stroke="#3a3133" strokeWidth="3" strokeLinecap="round" strokeDasharray="1 6" />
      <g transform="rotate(35 48 48)">
        <rect x="42" y="14" width="12" height="46" rx="2" fill="#e0b84a" stroke="#3a3133" strokeWidth="2.5" />
        <rect x="42" y="14" width="12" height="8" fill="#e58b8b" stroke="#3a3133" strokeWidth="2.5" />
        <path d="M42 60l6 12 6-12z" fill="#f2d7a8" stroke="#3a3133" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M46.5 69l1.5 3 1.5-3z" fill="#3a3133" />
      </g>
      <circle cx="66" cy="64" r="11" fill="rgba(255,255,255,0.35)" stroke="#b0202a" strokeWidth="4" />
      <path d="M74 72l9 9" stroke="#b0202a" strokeWidth="5" strokeLinecap="round" />
    </svg>
  );
}
