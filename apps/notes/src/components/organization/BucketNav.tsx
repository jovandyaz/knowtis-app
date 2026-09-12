import { useTranslation } from 'react-i18next';

import { Link, useLocation, useSearch } from '@tanstack/react-router';

import { ROUTES, STORAGE_KEYS } from '@/config';

import { useNoteCounts } from '@knowtis/data-access-notes';
import { BucketDot } from '@knowtis/design-system';
import { INBOX_FILTER, PARA_BUCKETS } from '@knowtis/shared-types';
import type { BucketFilter } from '@knowtis/shared-types';

import {
  NAV_COUNT,
  NAV_ICON_SLOT,
  NAV_LABEL,
  NAV_ROW,
  NAV_ROW_ACTIVE,
  NAV_ROW_IDLE,
} from './nav-row.styles';
import { SidebarSection } from './SidebarSection';

const NAV_ORDER = [
  INBOX_FILTER,
  ...PARA_BUCKETS,
] as const satisfies readonly BucketFilter[];

const UNCOUNTED_BUCKET: BucketFilter = 'archive';

interface BucketNavProps {
  onNavigate?: () => void;
}

export function BucketNav({ onNavigate }: BucketNavProps) {
  const { t } = useTranslation('notes');
  const { data: counts } = useNoteCounts();
  const pathname = useLocation({ select: (location) => location.pathname });
  const search = useSearch({ strict: false }) as { bucket?: BucketFilter };
  const onNotesList = pathname === ROUTES.NOTES;

  return (
    <SidebarSection
      title={t('organization.title')}
      storageKey={STORAGE_KEYS.SIDEBAR_BUCKETS_COLLAPSED}
    >
      {NAV_ORDER.map((bucket) => {
        const count = counts?.[bucket] ?? 0;
        const showsCount = bucket !== UNCOUNTED_BUCKET && count > 0;
        const isActive = onNotesList && search.bucket === bucket;

        return (
          <Link
            key={bucket}
            to={ROUTES.NOTES}
            search={{ bucket, view: 'all' }}
            onClick={onNavigate}
            activeOptions={{ exact: true }}
            activeProps={{}}
            inactiveProps={{}}
            aria-current={isActive ? 'page' : undefined}
            className={`${NAV_ROW} ${isActive ? NAV_ROW_ACTIVE : NAV_ROW_IDLE}`}
          >
            <span className={NAV_ICON_SLOT}>
              <BucketDot bucket={bucket} />
            </span>
            <span className={NAV_LABEL}>
              {t(`organization.buckets.${bucket}`)}
            </span>
            {showsCount && <span className={NAV_COUNT}>{count}</span>}
          </Link>
        );
      })}
    </SidebarSection>
  );
}
