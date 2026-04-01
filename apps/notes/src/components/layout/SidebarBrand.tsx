import { Link } from '@tanstack/react-router';

import { ROUTES } from '@/config';

import { KnowtisLogo } from './KnowtisLogo';

export function SidebarBrand() {
  return (
    <div className="flex h-16 items-center px-6">
      <Link
        to={ROUTES.DASHBOARD}
        className="flex items-center text-[oklch(0.58_0.24_290)] hover:opacity-80 transition-opacity cursor-pointer"
      >
        <KnowtisLogo className="h-7 w-auto" />
      </Link>
    </div>
  );
}
