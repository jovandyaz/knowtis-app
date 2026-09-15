import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';

import { useStudyKeyboard } from '@/hooks/useStudyKeyboard';
import { captureProductEvent } from '@/lib/analytics/product-events';
import { studyDurationBucket } from '@/pages/study-duration-bucket';
import { AnimatePresence, motion } from 'motion/react';
import { toast } from 'sonner';

import {
  useFlashcardProgress,
  useReviewCard,
} from '@knowtis/data-access-artifacts';
import {
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  useMotionPreset,
} from '@knowtis/design-system';
import {
  CARD_STATUS,
  SM2_QUALITY,
  STUDY_CARD_KIND,
  type FlashcardArtifact,
  type FlashcardProgress,
  type SM2Quality,
} from '@knowtis/shared-types';

import { deckStudyCards } from './flashcard/deck-study-cards';
import { FlashcardCard } from './flashcard/FlashcardCard';
import { FlashcardMenu } from './flashcard/FlashcardMenu';
import { FlashcardNav } from './flashcard/FlashcardNav';
import { FlashcardRating } from './flashcard/FlashcardRating';
import { FlashcardSummary } from './flashcard/FlashcardSummary';
import {
  findNextPendingIndex,
  useFlashcardSession,
} from './flashcard/use-flashcard-session';
import { STUDY_TOOL, StudyFocusDialog } from './focus/StudyFocusDialog';
import { StudyKeyHints, type StudyKeyHint } from './focus/StudyKeyHints';

const CARD_ENTER_X = 60;
const STUDY_CARD_SHORTCUTS = 'Space Enter ArrowLeft ArrowRight';

const KEYCAP = {
  SPACE: 'Space',
  ENTER: 'Enter',
  LEFT: '←',
  RIGHT: '→',
  ESCAPE: 'Esc',
} as const;

const RATING_KEYCAPS = ['1', '2', '3', '4'] as const;
const SIMPLE_RATING_KEYCAP_COUNT = 2;

const RATING_LABEL_KEY = {
  [SM2_QUALITY.AGAIN]: 'ai.artifacts.flashcards.quality.again',
  [SM2_QUALITY.HARD]: 'ai.artifacts.flashcards.quality.hard',
  [SM2_QUALITY.GOOD]: 'ai.artifacts.flashcards.quality.good',
  [SM2_QUALITY.EASY]: 'ai.artifacts.flashcards.quality.easy',
} as const satisfies Record<SM2Quality, string>;

interface FlashcardStudyProps {
  artifact: FlashcardArtifact;
  readOnly?: boolean | undefined;
  onClose: () => void;
}

export function FlashcardStudy({
  artifact,
  readOnly,
  onClose,
}: FlashcardStudyProps) {
  const { t } = useTranslation('notes');
  const { t: tCommon } = useTranslation('common');
  const {
    data: progress,
    isLoading,
    isError,
    refetch,
  } = useFlashcardProgress(readOnly ? undefined : artifact.id);

  if (isLoading || isError) {
    return (
      <StudyFocusDialog
        tool={STUDY_TOOL.FLASHCARDS}
        title={artifact.title}
        progress={{
          value: 0,
          max: artifact.content.cards.length,
          label: t(
            isLoading
              ? 'ai.artifacts.loadingStudy'
              : 'ai.artifacts.flashcards.progressError'
          ),
        }}
        inProgress={false}
        onClose={onClose}
      >
        {isLoading ? (
          <LoadingState message={t('ai.artifacts.loadingStudy')} />
        ) : (
          <ErrorState
            title={t('ai.artifacts.flashcards.progressError')}
            message={tCommon('errors.tryAgainLater')}
            retryLabel={tCommon('buttons.tryAgain')}
            onRetry={() => void refetch()}
          />
        )}
      </StudyFocusDialog>
    );
  }

  return (
    <FlashcardDeckSession
      artifact={artifact}
      progress={progress}
      readOnly={readOnly}
      onClose={onClose}
    />
  );
}

interface FlashcardDeckSessionProps {
  artifact: FlashcardArtifact;
  progress: FlashcardProgress[] | undefined;
  readOnly?: boolean | undefined;
  onClose: () => void;
}

function FlashcardDeckSession({
  artifact,
  progress,
  readOnly,
  onClose,
}: FlashcardDeckSessionProps) {
  const { t } = useTranslation('notes');
  const { mutateAsync: reviewCard } = useReviewCard();
  const cards = useMemo(
    () => deckStudyCards(artifact, progress),
    [artifact, progress]
  );
  const session = useFlashcardSession(cards);
  const preset = useMotionPreset();
  const [isSaving, setIsSaving] = useState(false);
  const [announcement, setAnnouncement] = useState({ text: '', sequence: 0 });
  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => ({ text, sequence: previous.sequence + 1 }));
  }, []);
  const focusNextCardRef = useRef<number | null>(null);
  const mountedCardRef = useRef<{
    node: HTMLButtonElement;
    index: number;
  } | null>(null);
  const focusCard = useCallback(
    (node: HTMLButtonElement | null) => {
      mountedCardRef.current = node
        ? { node, index: session.currentIndex }
        : null;
      if (node && focusNextCardRef.current === session.currentIndex) {
        focusNextCardRef.current = null;
        node.focus();
      }
    },
    [session.currentIndex]
  );

  const currentStatus = session.cardStatuses[session.currentIndex];
  const isCurrentCardPending = currentStatus === CARD_STATUS.PENDING;
  const isCurrentCardRated =
    currentStatus === CARD_STATUS.CORRECT ||
    currentStatus === CARD_STATUS.WRONG;
  const recordedQuality = session.ratings[session.currentIndex] ?? null;
  const completedCount =
    session.counts.correct + session.counts.wrong + session.counts.skipped;
  const ratedCount = session.counts.correct + session.counts.wrong;
  const previousRatedCountRef = useRef(ratedCount);
  useLayoutEffect(() => {
    const advanced = ratedCount > previousRatedCountRef.current;
    previousRatedCountRef.current = ratedCount;
    focusNextCardRef.current = null;
    if (!advanced || session.isComplete) {
      return;
    }
    // The entering card may mount later, after AnimatePresence finishes exiting.
    focusNextCardRef.current = session.currentIndex;
    if (mountedCardRef.current?.index === session.currentIndex) {
      mountedCardRef.current.node.focus();
      focusNextCardRef.current = null;
    }
  }, [ratedCount, session.isComplete, session.currentIndex]);

  const hasStartedRef = useRef(false);
  useEffect(() => {
    if (hasStartedRef.current) {
      return;
    }
    hasStartedRef.current = true;
    captureProductEvent('study session started', {
      source: 'note',
      due_count: cards.filter((card) => card.kind === STUDY_CARD_KIND.DUE)
        .length,
      new_count: cards.filter((card) => card.kind === STUDY_CARD_KIND.NEW)
        .length,
    });
  }, [cards]);

  const hasCompletedRef = useRef(false);
  useEffect(() => {
    if (!session.isComplete || hasCompletedRef.current) {
      return;
    }
    hasCompletedRef.current = true;
    captureProductEvent('study session completed', {
      source: 'note',
      reviewed_count: session.sessionResult.total,
      correct_count: session.sessionResult.correct,
      duration_bucket: studyDurationBucket(session.sessionResult.durationMs),
    });
  }, [session.isComplete, session.sessionResult]);

  const isReviewInFlightRef = useRef(false);

  const submitReview = useCallback(
    async (quality: SM2Quality) => {
      if (isReviewInFlightRef.current || !session.currentCard) {
        return null;
      }
      const { artifactId, cardIndex } = session.currentCard;
      const identity = `${artifactId}:${cardIndex}`;
      if (readOnly) {
        return identity;
      }
      isReviewInFlightRef.current = true;
      setIsSaving(true);
      try {
        await reviewCard({ artifactId, cardIndex, quality });
        return identity;
      } catch {
        toast.error(t('ai.artifacts.flashcards.reviewError'));
        return null;
      } finally {
        isReviewInFlightRef.current = false;
        setIsSaving(false);
      }
    },
    [session.currentCard, reviewCard, t, readOnly]
  );

  const handleRate = useCallback(
    async (quality: SM2Quality) => {
      if (!isCurrentCardPending) {
        return;
      }
      const identity = await submitReview(quality);
      if (identity && session.rateAdvanced(quality, identity)) {
        announce(
          t('ai.artifacts.flashcards.announce.rated', {
            rating: t(RATING_LABEL_KEY[quality]),
            done: completedCount + 1,
            count: session.totalCards,
          })
        );
      }
    },
    [isCurrentCardPending, submitReview, session, completedCount, t, announce]
  );

  const handleSkip = () => {
    session.skip();
    announce(
      t('ai.artifacts.flashcards.announce.skipped', {
        done: completedCount + 1,
        count: session.totalCards,
      })
    );
  };
  const handleShuffle = () => {
    session.shuffle();
    announce(t('ai.artifacts.flashcards.announce.shuffled'));
  };

  const handleNavigate = useCallback(
    (direction: -1 | 1) => {
      const nextIndex = session.currentIndex + direction;
      if (nextIndex >= 0 && nextIndex < session.totalCards) {
        session.navigate(nextIndex);
      }
    },
    [session]
  );

  const handleContinue = useCallback(() => {
    const nextIndex = findNextPendingIndex(
      session.cardStatuses,
      session.currentIndex
    );
    if (nextIndex >= 0) {
      session.navigate(nextIndex);
    }
  }, [session]);

  const isAdvancedRating = session.isAdvancedMode && !readOnly;

  useStudyKeyboard({
    enabled: !session.isComplete && session.totalCards > 0,
    insideFocusDialog: true,
    isAdvancedMode: isAdvancedRating,
    flipped: session.flipped,
    isBusy: () => isReviewInFlightRef.current,
    onFlip: session.flip,
    onNavigate: handleNavigate,
    onRate: (quality) => void handleRate(quality),
  });

  const flipKeys = [KEYCAP.SPACE, KEYCAP.ENTER];
  const exitHint: StudyKeyHint = {
    keys: [KEYCAP.ESCAPE],
    label: t('ai.artifacts.focus.hints.exit'),
  };
  const ratingKeys = isAdvancedRating
    ? [...RATING_KEYCAPS]
    : RATING_KEYCAPS.slice(0, SIMPLE_RATING_KEYCAP_COUNT);
  const hints: StudyKeyHint[] = session.flipped
    ? [
        { keys: flipKeys, label: t('ai.artifacts.focus.hints.showQuestion') },
        ...(isCurrentCardPending
          ? [{ keys: ratingKeys, label: t('ai.artifacts.flashcards.rateCard') }]
          : []),
        exitHint,
      ]
    : [
        { keys: flipKeys, label: t('ai.artifacts.focus.hints.showAnswer') },
        {
          keys: [KEYCAP.LEFT, KEYCAP.RIGHT],
          label: t('ai.artifacts.focus.hints.browse'),
        },
        exitHint,
      ];

  const renderStage = () => {
    if (session.totalCards === 0) {
      return (
        <EmptyState title={t('ai.artifacts.focus.emptyDeck')} description="">
          <Button size="lg" className="min-h-12" onClick={onClose}>
            {t('ai.artifacts.focus.backToNote')}
          </Button>
        </EmptyState>
      );
    }

    if (session.isComplete) {
      return (
        <FlashcardSummary
          result={session.sessionResult}
          onRestart={session.restart}
          onBackToNote={onClose}
        />
      );
    }

    if (!session.currentCard) {
      return null;
    }

    return (
      <div className="flex min-w-0 flex-col gap-6 overflow-x-hidden">
        <p className="text-center text-sm text-(--muted-foreground)">
          {t('ai.artifacts.focus.cardOf', {
            current: session.currentIndex + 1,
            total: session.totalCards,
          })}
        </p>

        <AnimatePresence mode="wait">
          <motion.div
            key={session.currentIndex}
            initial={{ opacity: 0, x: preset.reduced ? 0 : CARD_ENTER_X }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: preset.reduced ? 0 : -CARD_ENTER_X }}
            transition={preset.slide}
          >
            <FlashcardCard
              ref={focusCard}
              front={session.currentCard.front}
              back={session.currentCard.back}
              difficulty={session.currentCard.difficulty}
              flipped={session.flipped}
              onFlip={session.flip}
              keyShortcuts={STUDY_CARD_SHORTCUTS}
            />
          </motion.div>
        </AnimatePresence>
      </div>
    );
  };

  return (
    <StudyFocusDialog
      tool={STUDY_TOOL.FLASHCARDS}
      title={artifact.title}
      progress={{
        value: completedCount,
        max: session.totalCards,
        label: t('ai.artifacts.focus.completedOf', {
          done: completedCount,
          count: session.totalCards,
        }),
      }}
      inProgress={completedCount > 0 && !session.isComplete}
      onClose={onClose}
      menu={
        session.isComplete || session.totalCards === 0 ? undefined : (
          <FlashcardMenu
            isAdvancedMode={session.isAdvancedMode}
            disabled={isSaving}
            onToggleAdvanced={session.toggleAdvanced}
            onRestart={() => session.restart()}
            onShuffle={handleShuffle}
            readOnly={readOnly}
          />
        )
      }
      actions={
        !session.isComplete && session.currentCard ? (
          <div className="flex flex-col gap-3">
            <div className="flex min-h-16 flex-col items-center justify-center gap-3">
              {session.flipped && isCurrentCardPending ? (
                <FlashcardRating
                  isAdvancedMode={session.isAdvancedMode}
                  readOnly={readOnly}
                  disabled={isSaving}
                  showKeys
                  onWrong={() => void handleRate(SM2_QUALITY.AGAIN)}
                  onCorrect={() => void handleRate(SM2_QUALITY.GOOD)}
                  onRateAdvanced={(quality) => void handleRate(quality)}
                />
              ) : null}
              {session.flipped && currentStatus === CARD_STATUS.SKIPPED ? (
                <Button
                  variant="outline"
                  className="min-h-12"
                  onClick={session.reviewSkipped}
                >
                  {t('ai.artifacts.flashcards.reviewCard')}
                </Button>
              ) : null}
              {session.flipped &&
              isCurrentCardRated &&
              recordedQuality !== null ? (
                <>
                  <p className="text-sm text-(--muted-foreground)">
                    {t('ai.artifacts.flashcards.recorded', {
                      rating: t(RATING_LABEL_KEY[recordedQuality]),
                    })}
                  </p>
                  <Button
                    variant="outline"
                    className="min-h-12"
                    onClick={handleContinue}
                  >
                    {t('ai.artifacts.flashcards.continueStudying')}
                  </Button>
                </>
              ) : null}
            </div>

            <FlashcardNav
              wrongCount={session.counts.wrong}
              correctCount={session.counts.correct}
              canGoPrev={!isSaving && session.currentIndex > 0}
              canGoNext={
                !isSaving && session.currentIndex < session.totalCards - 1
              }
              canSkip={!isSaving && isCurrentCardPending}
              onNavigatePrev={() => handleNavigate(-1)}
              onNavigateNext={() => handleNavigate(1)}
              onSkip={handleSkip}
            />
          </div>
        ) : undefined
      }
      hints={
        session.isComplete || session.totalCards === 0 ? undefined : (
          <StudyKeyHints hints={hints} />
        )
      }
    >
      <div role="status" aria-live="polite" className="sr-only">
        <Fragment key={announcement.sequence}>{announcement.text}</Fragment>
      </div>
      {renderStage()}
    </StudyFocusDialog>
  );
}
