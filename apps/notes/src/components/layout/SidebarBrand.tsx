import { Link } from '@tanstack/react-router';

import { ROUTES } from '@/config';

import { KnowtisLogo } from './KnowtisLogo';

export function SidebarBrand() {
  return (
    <div className="flex h-12 shrink-0 items-center px-4">
      <Link
        to={ROUTES.DASHBOARD}
        className="flex items-center text-primary hover:opacity-80 transition-opacity cursor-pointer"
      >
        <KnowtisLogo className="h-6 w-auto" />
      </Link>
    </div>
  );
}
