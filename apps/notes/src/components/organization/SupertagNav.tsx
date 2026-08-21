import { useTranslation } from 'react-i18next';

import { Link, useLocation, useSearch } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { Shapes } from 'lucide-react';

import { useNoteCounts } from '@knowtis/data-access-notes';
import { SUPERTAGS, type Supertag } from '@knowtis/shared-types';

import {
  NAV_COUNT,
  NAV_ICON_SLOT,
  NAV_LABEL,
  NAV_ROW,
  NAV_ROW_ACTIVE,
  NAV_ROW_IDLE,
} from './nav-row.styles';

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
            className={`${NAV_ROW} ${
              activeType === type ? NAV_ROW_ACTIVE : NAV_ROW_IDLE
            }`}
          >
            <span className={NAV_ICON_SLOT}>
              <Shapes className="h-3 w-3 opacity-60" />
            </span>
            <span className={NAV_LABEL}>
              {t(`organization.supertags.names.${type}`)}
            </span>
            <span className={NAV_COUNT}>{counts?.supertags[type]}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
