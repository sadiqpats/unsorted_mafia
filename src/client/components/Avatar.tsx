import { serverUrl } from '../lib/server';

/**
 * A player's photo (or initials). When the player is out, the picture is "cut off":
 * sliced diagonally, the halves knocked apart and drained of colour, with a red slash.
 */
export function Avatar({ name, photo, dead = false, size = 48, className = '' }: { name: string; photo: string | null; dead?: boolean; size?: number; className?: string }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const face = photo ? (
    <img src={serverUrl(photo)} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
  ) : (
    <div className="absolute inset-0 grid place-items-center bg-[radial-gradient(circle_at_30%_25%,#4a1b1e,#140f10_70%)] font-[family-name:var(--font-display)] text-gold" style={{ fontSize: size * 0.36 }}>
      {initials}
    </div>
  );
  return (
    <div
      className={`cut-photo relative shrink-0 ${dead ? 'is-dead' : ''} ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={dead ? `${name} (eliminated)` : name}
    >
      <div className="cut-half cut-a">{face}</div>
      <div className="cut-half cut-b">{face}</div>
      <div className="cut-slash" aria-hidden="true" />
      <div className="pointer-events-none absolute inset-0 rounded-[18%] ring-1 ring-gold/30" aria-hidden="true" />
    </div>
  );
}
