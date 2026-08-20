import { useTranslation } from 'react-i18next';

import { Link } from '@tanstack/react-router';

import { ROUTES } from '@/config';

import { useNoteCounts } from '@knowtis/data-access-notes';
import { INBOX_FILTER, PARA_BUCKETS } from '@knowtis/shared-types';
import type { BucketFilter } from '@knowtis/shared-types';

import { BucketDot } from './BucketDot';

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

  return (
    <div className="flex flex-col gap-1">
      <span className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/60">
        {t('organization.title')}
      </span>
      <div className="flex flex-col gap-0.5">
        {NAV_ORDER.map((bucket) => {
          const count = counts?.[bucket] ?? 0;
          const showsCount = bucket !== UNCOUNTED_BUCKET && count > 0;

          return (
            <Link
              key={bucket}
              to={ROUTES.NOTES}
              search={{ bucket, view: 'all' }}
              onClick={onNavigate}
              activeOptions={{ exact: true }}
              className="flex items-center gap-2 rounded-md px-2 py-1 text-sm transition-colors cursor-pointer"
              activeProps={{
                className: 'bg-muted text-foreground font-medium',
              }}
              inactiveProps={{
                className:
                  'text-muted-foreground hover:bg-primary/5 hover:text-primary',
              }}
            >
              <BucketDot bucket={bucket} />
              <span className="flex-1 truncate">
                {t(`organization.buckets.${bucket}`)}
              </span>
              {showsCount && (
                <span className="text-xs text-muted-foreground/60">
                  {count}
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
