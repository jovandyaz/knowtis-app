import { useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { MOBILE_FAB_RAIL_CLEARANCE_CLASS } from '@/components/layout/MobileFabRail';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';

import {
  useFlashcardProgress,
  useReviewCard,
} from '@knowtis/data-access-artifacts';
import {
  cn,
  ErrorState,
  LoadingState,
  useMotionPreset,
} from '@knowtis/design-system';
import {
  CARD_STATUS,
  SM2_QUALITY,
  type FlashcardArtifact,
  type FlashcardProgress,
  type SM2Quality,
} from '@knowtis/shared-types';

import { deckStudyCards } from './flashcard/deck-study-cards';
import { FlashcardCard } from './flashcard/FlashcardCard';
import { FlashcardHeader } from './flashcard/FlashcardHeader';
import { FlashcardNav } from './flashcard/FlashcardNav';
import { FlashcardRating } from './flashcard/FlashcardRating';
import { FlashcardSummary } from './flashcard/FlashcardSummary';
import { useFlashcardSession } from './flashcard/use-flashcard-session';

const CARD_ENTER_X = 60;

interface FlashcardStudyProps {
  artifact: FlashcardArtifact;
  readOnly?: boolean | undefined;
}

export function FlashcardStudy({ artifact, readOnly }: FlashcardStudyProps) {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const {
    data: progress,
    isLoading,
    isError,
    refetch,
  } = useFlashcardProgress(readOnly ? undefined : artifact.id);

  if (isLoading) {
    return <LoadingState message={t('ai.artifacts.loadingStudy')} />;
  }

  if (isError) {
    return (
      <ErrorState
        title={t('ai.artifacts.flashcards.progressError')}
        message={tCommon('errors.tryAgainLater')}
        retryLabel={tCommon('buttons.tryAgain')}
        onRetry={() => void refetch()}
      />
    );
  }

  return (
    <FlashcardDeckSession
      artifact={artifact}
      progress={progress}
      readOnly={readOnly}
    />
  );
}

interface FlashcardDeckSessionProps {
  artifact: FlashcardArtifact;
  progress: FlashcardProgress[] | undefined;
  readOnly?: boolean | undefined;
}

function FlashcardDeckSession({
  artifact,
  progress,
  readOnly,
}: FlashcardDeckSessionProps) {
  const { t } = useTranslation('notes');
  const { mutateAsync: reviewCard, isPending: isReviewPending } =
    useReviewCard();
  const cards = useMemo(
    () => deckStudyCards(artifact, progress),
    [artifact, progress]
  );
  const session = useFlashcardSession(cards);
  const preset = useMotionPreset();

  const isCurrentCardPending =
    session.cardStatuses[session.currentIndex] === CARD_STATUS.PENDING;

  const isReviewInFlightRef = useRef(false);

  const submitReview = useCallback(
    async (quality: SM2Quality) => {
      if (readOnly) {
        return true;
      }
      if (isReviewInFlightRef.current || !session.currentCard) {
        return false;
      }
      const { artifactId, cardIndex } = session.currentCard;
      isReviewInFlightRef.current = true;
      try {
        await reviewCard({ artifactId, cardIndex, quality });
        return true;
      } catch {
        toast.error(t('ai.artifacts.flashcards.reviewError'));
        return false;
      } finally {
        isReviewInFlightRef.current = false;
      }
    },
    [session.currentCard, reviewCard, t, readOnly]
  );

  const handleWrong = useCallback(async () => {
    if (!isCurrentCardPending) {
      return;
    }
    if (await submitReview(SM2_QUALITY.AGAIN)) {
      session.rate('wrong');
    }
  }, [isCurrentCardPending, submitReview, session]);

  const handleCorrect = useCallback(async () => {
    if (!isCurrentCardPending) {
      return;
    }
    if (await submitReview(SM2_QUALITY.GOOD)) {
      session.rate('correct');
    }
  }, [isCurrentCardPending, submitReview, session]);

  const handleRateAdvanced = useCallback(
    async (quality: SM2Quality) => {
      if (!isCurrentCardPending) {
        return;
      }
      if (await submitReview(quality)) {
        session.rateAdvanced(quality);
      }
    },
    [isCurrentCardPending, submitReview, session]
  );

  const handleNavigatePrev = useCallback(() => {
    if (session.currentIndex > 0) {
      session.navigate(session.currentIndex - 1);
    }
  }, [session]);

  const handleNavigateNext = useCallback(() => {
    if (session.currentIndex < session.totalCards - 1) {
      session.skip();
    } else {
      session.finish();
    }
  }, [session]);

  if (session.isComplete) {
    return (
      <FlashcardSummary
        result={session.sessionResult}
        onRestart={session.restart}
      />
    );
  }

  if (!session.currentCard) {
    return null;
  }

  const reviewedCount =
    session.counts.correct + session.counts.wrong + session.counts.skipped;

  return (
    <div
      className={cn(
        'flex flex-col gap-6 min-w-0 overflow-x-hidden',
        MOBILE_FAB_RAIL_CLEARANCE_CLASS
      )}
    >
      <FlashcardHeader
        current={session.currentIndex}
        total={session.totalCards}
        reviewedCount={reviewedCount}
        isAdvancedMode={session.isAdvancedMode}
        onToggleAdvanced={session.toggleAdvanced}
        onRestart={() => session.restart('all')}
        onShuffle={session.shuffle}
        readOnly={readOnly}
      />

      <AnimatePresence mode="wait">
        <motion.div
          key={session.currentIndex}
          initial={{ opacity: 0, x: preset.reduced ? 0 : CARD_ENTER_X }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: preset.reduced ? 0 : -CARD_ENTER_X }}
          transition={preset.slide}
        >
          <FlashcardCard
            front={session.currentCard.front}
            back={session.currentCard.back}
            difficulty={session.currentCard.difficulty}
            flipped={session.flipped}
            onFlip={session.flip}
          />
        </motion.div>
      </AnimatePresence>

      {session.flipped ? (
        <FlashcardRating
          isAdvancedMode={session.isAdvancedMode}
          readOnly={readOnly}
          disabled={isReviewPending}
          onWrong={() => void handleWrong()}
          onCorrect={() => void handleCorrect()}
          onRateAdvanced={(quality) => void handleRateAdvanced(quality)}
        />
      ) : (
        <FlashcardNav
          wrongCount={session.counts.wrong}
          correctCount={session.counts.correct}
          canGoPrev={session.currentIndex > 0}
          onNavigatePrev={handleNavigatePrev}
          onNavigateNext={handleNavigateNext}
        />
      )}
    </div>
  );
}
