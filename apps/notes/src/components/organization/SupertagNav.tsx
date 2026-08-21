import { useTranslation } from 'react-i18next';

import { Link, useLocation, useSearch } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { Shapes } from 'lucide-react';

import { useNoteCounts } from '@knowtis/data-access-notes';
import { SUPERTAGS, type Supertag } from '@knowtis/shared-types';

interface SupertagNavProps {
  onNavigate?: () => void;
}

export function SupertagNav({ onNavigate }: SupertagNavProps) {
  const { t } = useTranslation('notes');
  const { data: counts } = useNoteCounts();
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = useSearch({ strict: false }) as { supertag?: Supertag };

  // Only types in use are listed, so the section is never a permanent empty state.
  const inUse = SUPERTAGS.filter((type) => (counts?.supertags[type] ?? 0) > 0);
  if (!inUse.length) {
    return null;
  }

  const activeType = pathname === ROUTES.NOTES ? search.supertag : undefined;

  return (
    <div className="flex flex-col gap-1">
      <span className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {t('organization.typesTitle')}
      </span>
      <div className="flex flex-col gap-0.5">
        {inUse.map((type) => (
          <Link
            key={type}
            to={ROUTES.NOTES}
            search={{ supertag: type, view: 'all' }}
            onClick={onNavigate}
            activeProps={{}}
            inactiveProps={{}}
            aria-current={activeType === type ? 'page' : undefined}
            className={`flex min-h-8 items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors cursor-pointer ${
              activeType === type
                ? 'bg-muted text-foreground font-medium'
                : 'text-muted-foreground hover:bg-primary/5 hover:text-primary'
            }`}
          >
            <Shapes className="h-3 w-3 shrink-0 opacity-60" />
            <span className="flex-1 truncate">
              {t(`organization.supertags.names.${type}`)}
            </span>
            <span className="text-xs text-muted-foreground/60">
              {counts?.supertags[type]}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
