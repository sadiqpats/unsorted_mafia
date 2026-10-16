import { Link } from 'react-router-dom';
import { Clapper } from '../charades/art';
import { RoleArt } from './RoleArt';

/** "Also on Unsorted": a card at the bottom of each game's page that jumps to the other game. */
export function OtherGame({ game }: { game: 'mafia' | 'charades' }) {
  if (game === 'charades') {
    return (
      <Link to="/charades" className="hub-card hub-charades card group relative flex items-center gap-4 overflow-hidden p-4 text-left focus-ring" data-testid="other-game">
        <span className="hub-glow" aria-hidden="true" />
        <Clapper size={72} className="relative shrink-0 transition-transform duration-500 group-hover:-rotate-3" />
        <span className="relative min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-[0.25em] text-[#ffd98a]">Also on Unsorted</span>
          <span className="charades-title mt-1 block text-2xl">Bollywood Dumb Charades</span>
          <span className="mt-0.5 block text-sm text-white/75">Act it out. No words. Full drama. →</span>
        </span>
      </Link>
    );
  }
  return (
    <Link to="/mafia" className="hub-card hub-mafia card group relative flex items-center gap-4 overflow-hidden p-4 text-left focus-ring" style={{ background: 'linear-gradient(180deg, #221d1f, #141112)', borderColor: 'rgba(201,164,92,0.35)' }} data-testid="other-game">
      <span className="hub-glow" aria-hidden="true" />
      <RoleArt art="fedora" alignment="mafia" size={72} className="relative shrink-0 transition-transform duration-500 group-hover:scale-105" />
      <span className="relative min-w-0">
        <span className="block text-xs font-semibold uppercase tracking-[0.25em] text-[#c9a45c]">Also on Unsorted</span>
        <span className="brand-title mt-1 block text-2xl font-black">Mafia Night</span>
        <span className="mt-0.5 block font-[family-name:var(--font-serif)] text-base italic text-[#a69c90]">Trust no one. Not even your friends. →</span>
      </span>
    </Link>
  );
}
