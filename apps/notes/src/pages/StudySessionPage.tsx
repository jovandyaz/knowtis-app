import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { Link, Navigate } from '@tanstack/react-router';

import { FlashcardCard } from '@/components/artifacts/flashcard/FlashcardCard';
import { FlashcardRating } from '@/components/artifacts/flashcard/FlashcardRating';
import { FlashcardSummary } from '@/components/artifacts/flashcard/FlashcardSummary';
import { useFlashcardSession } from '@/components/artifacts/flashcard/use-flashcard-session';
import { ROUTES } from '@/config';
import { CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  useReviewCard,
  useStudySession,
  useStudyStats,
} from '@knowtis/data-access-artifacts';
import {
  useFeatureFlag,
  useFeatureFlags,
} from '@knowtis/data-access-feature-flags';
import {
  buttonVariants,
  cn,
  DeckChip,
  EmptyState,
  ErrorState,
  Progress,
  Skeleton,
  TOUCH_TARGET_CLASS,
} from '@knowtis/design-system';
import {
  FEATURE_FLAG_KEYS,
  SM2_QUALITY,
  STUDY_CARD_KIND,
  type RestartFilter,
  type SM2Quality,
  type StudyCard,
} from '@knowtis/shared-types';
import { formatRelativeTime } from '@knowtis/shared-util';

const BROWSER_TIME_ZONE = Intl.DateTimeFormat().resolvedOptions().timeZone;
const PAGE_LAYOUT =
  'mx-auto flex w-full min-w-0 max-w-xl flex-col gap-6 px-4 py-6';
const CTA_CLASS = 'rounded-lg px-4 text-sm font-medium';

export function StudySessionPage() {
  const { isPending: areFlagsPending } = useFeatureFlags();
  const isQueueEnabled = useFeatureFlag(FEATURE_FLAG_KEYS.STUDY_REVIEW_QUEUE);

  if (areFlagsPending) {
    return <StudyCardSkeleton />;
  }

  if (!isQueueEnabled) {
    return <Navigate to={ROUTES.DASHBOARD} replace />;
  }

  return <StudyQueue />;
}

function StudyQueue() {
  const { t: tCommon } = useTranslation('common');
  const queue = useStudySession(BROWSER_TIME_ZONE);
  const stats = useStudyStats(BROWSER_TIME_ZONE);
  const [attempt, setAttempt] = useState(0);

  const startNewQueue = useCallback(() => {
    setAttempt((previous) => previous + 1);
  }, []);

  const servedCards = queue.data?.cards;
  const currentStats = stats.data ?? queue.data?.stats;

  if (servedCards === undefined) {
    return queue.isError ? (
      <div className={PAGE_LAYOUT}>
        <ErrorState
          title={tCommon('errors.errorLoadingData')}
          message={tCommon('errors.tryAgainLater')}
          retryLabel={tCommon('buttons.tryAgain')}
          onRetry={() => void queue.refetch()}
        />
      </div>
    ) : (
      <StudyCardSkeleton />
    );
  }

  return (
    <StudyQueueSession
      key={attempt}
      cards={servedCards}
      streak={currentStats?.currentStreak ?? 0}
      onNewQueue={startNewQueue}
      emptyState={<StudyCaughtUp nextDueAt={currentStats?.nextDueAt ?? null} />}
    />
  );
}

interface StudyQueueSessionProps {
  cards: StudyCard[];
  streak: number;
  onNewQueue: () => void;
  emptyState: ReactNode;
}

// The card list is read once, at mount: every review invalidates the artifact
// queries and the server reorders what is left, so only a remount (a new `key`)
// may pick up a fresh queue.
function StudyQueueSession({
  cards,
  streak,
  onNewQueue,
  emptyState,
}: StudyQueueSessionProps) {
  const { t } = useTranslation('notes');
  const session = useFlashcardSession(cards);
  const { mutateAsync: reviewCard, isPending: isReviewPending } =
    useReviewCard();

  const submitReview = useCallback(
    (quality: SM2Quality) => {
      if (!session.currentCard) {
        return;
      }
      const { artifactId, cardIndex } = session.currentCard;
      void reviewCard({ artifactId, cardIndex, quality }).catch(() => {
        toast.error(t('ai.artifacts.flashcards.reviewError'));
      });
    },
    [session.currentCard, reviewCard, t]
  );

  const handleWrong = useCallback(() => {
    submitReview(SM2_QUALITY.AGAIN);
    session.rate('wrong');
  }, [submitReview, session]);

  const handleCorrect = useCallback(() => {
    submitReview(SM2_QUALITY.GOOD);
    session.rate('correct');
  }, [submitReview, session]);

  const handleRateAdvanced = useCallback(
    (quality: SM2Quality) => {
      submitReview(quality);
      session.rateAdvanced(quality);
    },
    [submitReview, session]
  );

  const handleRestart = useCallback(
    (filter: RestartFilter) => {
      if (filter === 'all') {
        onNewQueue();
        return;
      }
      session.restart(filter);
    },
    [onNewQueue, session]
  );

  if (session.totalCards === 0) {
    return emptyState;
  }

  if (session.isComplete) {
    return (
      <div className={PAGE_LAYOUT}>
        <FlashcardSummary
          result={session.sessionResult}
          onRestart={handleRestart}
        />
        <div className="flex flex-col items-center gap-4">
          <p className="text-sm text-(--muted-foreground)">
            {t('study.summary.streak', { count: streak })}
          </p>
          <Link
            to={ROUTES.DASHBOARD}
            className={cn(
              buttonVariants({ variant: 'outline' }),
              TOUCH_TARGET_CLASS,
              CTA_CLASS
            )}
          >
            {t('study.summary.backHome')}
          </Link>
        </div>
      </div>
    );
  }

  const card = session.currentCard;
  if (!card) {
    return null;
  }

  const reviewedCount =
    session.counts.correct + session.counts.wrong + session.counts.skipped;

  return (
    <div className={PAGE_LAYOUT}>
      <div className="flex flex-col gap-3">
        <Progress
          value={reviewedCount}
          max={session.totalCards}
          label={t('ai.artifacts.flashcards.reviewedOf', {
            reviewed: reviewedCount,
            total: session.totalCards,
          })}
        />
        <div className="flex min-w-0 items-center justify-between gap-2">
          <DeckChip
            title={card.deckTitle}
            tone={card.bucket ?? 'neutral'}
            isNew={card.kind === STUDY_CARD_KIND.NEW}
            newLabel={t('study.newBadge')}
          />
          <span className="shrink-0 text-xs text-(--muted-foreground)">
            {t('ai.artifacts.flashcards.cardOf', {
              current: session.currentIndex + 1,
              total: session.totalCards,
            })}
          </span>
        </div>
      </div>

      <FlashcardCard
        front={card.front}
        back={card.back}
        difficulty={card.difficulty}
        flipped={session.flipped}
        onFlip={session.flip}
      />

      {session.flipped ? (
        <FlashcardRating
          isAdvancedMode={session.isAdvancedMode}
          disabled={isReviewPending}
          onWrong={handleWrong}
          onCorrect={handleCorrect}
          onRateAdvanced={handleRateAdvanced}
        />
      ) : null}
    </div>
  );
}

interface StudyCaughtUpProps {
  nextDueAt: string | null;
}

function StudyCaughtUp({ nextDueAt }: StudyCaughtUpProps) {
  const { t, i18n } = useTranslation('notes');

  return (
    <div className={PAGE_LAYOUT}>
      <EmptyState
        icon={<CheckCircle2 className="h-8 w-8 text-learn-correct-text" />}
        title={t('study.caughtUp.title')}
        description={
          nextDueAt
            ? t('study.caughtUp.nextReview', {
                when: formatRelativeTime(new Date(nextDueAt), i18n.language),
              })
            : t('study.caughtUp.nothingScheduled')
        }
      >
        <Link
          to={ROUTES.NOTES}
          className={cn(
            buttonVariants({ variant: 'outline' }),
            TOUCH_TARGET_CLASS,
            CTA_CLASS
          )}
        >
          {t('study.caughtUp.cta')}
        </Link>
      </EmptyState>
    </div>
  );
}

function StudyCardSkeleton() {
  const { t } = useTranslation('notes');

  return (
    <div role="status" aria-label={t('study.loading')} className={PAGE_LAYOUT}>
      <Skeleton className="h-1.5 w-full" />
      <Skeleton className="h-4 w-40" />
      <Skeleton className="h-72 w-full rounded-lg" />
      <div className="flex justify-center gap-4">
        <Skeleton className="h-11 w-32 rounded-full" />
        <Skeleton className="h-11 w-32 rounded-full" />
      </div>
    </div>
  );
}
