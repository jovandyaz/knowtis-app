import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { toast } from 'sonner';

import { useReviewCard } from '@knowtis/data-access-artifacts';
import {
  SM2_QUALITY,
  type FlashcardArtifact,
  type SM2Quality,
} from '@knowtis/shared-types';

import {
  FlashcardCard,
  FlashcardControls,
  FlashcardHeader,
  FlashcardSummary,
  useStudySession,
} from './flashcard';

interface FlashcardStudyProps {
  artifact: FlashcardArtifact;
  readOnly?: boolean | undefined;
}

export function FlashcardStudy({ artifact, readOnly }: FlashcardStudyProps) {
  const { t } = useTranslation('notes');
  const reviewCard = useReviewCard(artifact.id);
  const session = useStudySession(artifact.content);

  const submitReview = useCallback(
    (quality: number) => {
      if (readOnly) {
        return;
      }
      reviewCard.mutate(
        { cardIndex: session.currentIndex, quality },
        {
          onError: () => {
            toast.error(t('ai.artifacts.flashcards.reviewError'));
          },
        }
      );
    },
    [session.currentIndex, reviewCard, t, readOnly]
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
    <div className="flex flex-col gap-6 min-w-0 overflow-x-hidden">
      <FlashcardHeader
        current={session.currentIndex}
        total={session.totalCards}
        reviewedCount={reviewedCount}
        isAdvancedMode={session.isAdvancedMode}
        onToggleAdvanced={session.toggleAdvanced}
        onRestart={() => session.restart('all')}
        readOnly={readOnly}
      />

      <FlashcardCard
        front={session.currentCard.front}
        back={session.currentCard.back}
        difficulty={session.currentCard.difficulty}
        flipped={session.flipped}
        cardIndex={session.currentIndex}
        onFlip={session.flip}
      />

      <FlashcardControls
        isAdvancedMode={session.isAdvancedMode}
        isFlipped={session.flipped}
        readOnly={readOnly}
        onWrong={handleWrong}
        onCorrect={handleCorrect}
        onNavigatePrev={handleNavigatePrev}
        onNavigateNext={handleNavigateNext}
        onRateAdvanced={handleRateAdvanced}
        wrongCount={session.counts.wrong}
        correctCount={session.counts.correct}
        disabled={reviewCard.isPending}
        canGoPrev={session.currentIndex > 0}
      />
    </div>
  );
}
