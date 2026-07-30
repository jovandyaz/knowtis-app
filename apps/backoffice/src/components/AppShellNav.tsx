import { Link } from '@tanstack/react-router';

import { ADMIN_SECTIONS } from '@/config/admin-sections';
import { ROUTES } from '@/config/routes.config';

import { cn } from '@knowtis/design-system';

const NAV_LINK_CLASS =
  'rounded px-3 py-2 text-sm hover:bg-(--muted) [&.active]:bg-(--muted) max-md:flex max-md:min-h-11 max-md:items-center';

interface AppShellNavProps {
  className?: string;
  onNavigate?: () => void;
}

export function AppShellNav({ className, onNavigate }: AppShellNavProps) {
  return (
    <nav className={cn('flex flex-col gap-1', className)}>
      <Link
        to={ROUTES.ROOT}
        activeOptions={{ exact: true }}
        className={NAV_LINK_CLASS}
        onClick={onNavigate}
      >
        Dashboard
      </Link>
      {ADMIN_SECTIONS.map((section) => (
        <Link
          key={section.to}
          to={section.to}
          className={NAV_LINK_CLASS}
          onClick={onNavigate}
        >
          {section.label}
        </Link>
      ))}
    </nav>
  );
}
