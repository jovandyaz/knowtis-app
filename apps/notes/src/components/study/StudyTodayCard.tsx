import { useTranslation } from 'react-i18next';

import { Link } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { useStudyQueueAccess } from '@/hooks/useStudyQueueAccess';
import { BROWSER_TIME_ZONE } from '@/lib/browser-time-zone';

import { useStudyStats } from '@knowtis/data-access-artifacts';
import { buttonVariants, cn, Skeleton, StatTile } from '@knowtis/design-system';
import { formatRelativeTime } from '@knowtis/shared-util';

const CARD_LAYOUT = 'mt-8 flex flex-col gap-4';
const SECTION_TITLE =
  'text-xs font-medium text-(--muted-foreground)/50 uppercase tracking-wider';
const CTA_CLASS = 'w-full rounded-lg px-4 text-sm font-medium';

export function StudyTodayCard() {
  const { t, i18n } = useTranslation('notes');
  const access = useStudyQueueAccess();
  const stats = useStudyStats(BROWSER_TIME_ZONE, {
    enabled: access.isEnabled,
  });

  if (access.isPending) {
    return <StudyTodayCardSkeleton />;
  }

  if (access.isError || !access.isEnabled) {
    return null;
  }

  if (stats.isPending) {
    return <StudyTodayCardSkeleton />;
  }

  if (stats.isError) {
    return null;
  }

  const { dueCount, newCount, currentStreak, nextDueAt } = stats.data;

  return (
    <div className={CARD_LAYOUT}>
      <h2 className={SECTION_TITLE}>{t('study.todayCard.title')}</h2>
      {dueCount + newCount === 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm font-medium text-(--foreground)">
            {t('study.caughtUp.title')}
          </p>
          <p className="text-sm text-(--muted-foreground)">
            {nextDueAt
              ? t('study.caughtUp.nextReview', {
                  when: formatRelativeTime(new Date(nextDueAt), i18n.language),
                })
              : t('study.caughtUp.nothingScheduled')}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <StatTile value={dueCount} label={t('study.todayCard.dueLabel')} />
            <StatTile
              value={newCount}
              label={t('study.todayCard.newLabel', { count: newCount })}
            />
            <StatTile
              value={currentStreak}
              label={t('study.todayCard.streakLabel', { count: currentStreak })}
            />
          </div>
          <Link
            to={ROUTES.STUDY}
            className={cn(buttonVariants({ variant: 'default' }), CTA_CLASS)}
          >
            {t('study.todayCard.cta')}
          </Link>
        </>
      )}
    </div>
  );
}

function StudyTodayCardSkeleton() {
  const { t } = useTranslation('notes');

  return (
    <div role="status" aria-label={t('study.loading')} className={CARD_LAYOUT}>
      <Skeleton className="h-3 w-24" />
      <div className="grid grid-cols-3 gap-3">
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-16 w-full rounded-lg" />
      </div>
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  );
}
