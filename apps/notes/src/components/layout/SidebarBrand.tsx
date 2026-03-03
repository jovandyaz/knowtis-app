import { Link } from '@tanstack/react-router';

import { KnowtisLogo } from './KnowtisLogo';

/**
 * Sidebar brand props interface
 * @property {() => void} onClick - The function to call when the brand is clicked
 */
interface SidebarBrandProps {
  onClick?: () => void;
}

export function SidebarBrand({ onClick }: SidebarBrandProps) {
  return (
    <div className="flex h-16 items-center px-6 border-b border-border/40">
      <Link
        to="/"
        className="flex items-center text-[oklch(0.58_0.24_290)] hover:opacity-80 transition-opacity cursor-pointer"
        onClick={onClick}
      >
        <KnowtisLogo className="h-7 w-auto" />
      </Link>
    </div>
  );
}
