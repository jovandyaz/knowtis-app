import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';

import {
  useFlashcardProgress,
  useReviewCard,
} from '@knowtis/data-access-artifacts';
import { useMotionPreset } from '@knowtis/design-system';
import {
  SM2_QUALITY,
  type FlashcardArtifact,
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
  const { mutateAsync: reviewCard, isPending: isReviewPending } =
    useReviewCard();
  const { data: progress } = useFlashcardProgress(
    readOnly ? undefined : artifact.id
  );
  const cards = useMemo(
    () => deckStudyCards(artifact, progress),
    [artifact, progress]
  );
  const session = useFlashcardSession(cards);
  const preset = useMotionPreset();

  const submitReview = useCallback(
    (quality: SM2Quality) => {
      if (readOnly || !session.currentCard) {
        return;
      }
      const { artifactId, cardIndex } = session.currentCard;
      void reviewCard({ artifactId, cardIndex, quality }).catch(() => {
        toast.error(t('ai.artifacts.flashcards.reviewError'));
      });
    },
    [session.currentCard, reviewCard, t, readOnly]
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
          onWrong={handleWrong}
          onCorrect={handleCorrect}
          onRateAdvanced={handleRateAdvanced}
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
