import {
  Fragment,
  useCallback,
  useEffect,
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
  type SegmentState,
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
import { useFlashcardSession } from './flashcard/use-flashcard-session';
import { useRatingPresentation } from './flashcard/use-rating-presentation';
import { STUDY_TOOL, StudyFocusDialog } from './focus/StudyFocusDialog';
import { StudyKeyHints, type StudyKeyHint } from './focus/StudyKeyHints';

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
          segments: Array<SegmentState>(artifact.content.cards.length).fill(
            'pending'
          ),
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
  const [announcement, setAnnouncement] = useState({ text: '', sequence: 0 });
  const announce = useCallback((text: string) => {
    setAnnouncement((previous) => ({ text, sequence: previous.sequence + 1 }));
  }, []);
  const currentStatus = session.cardStatuses[session.currentIndex];
  const isCurrentCardPending = currentStatus === CARD_STATUS.PENDING;
  const isCurrentCardRated =
    currentStatus === CARD_STATUS.CORRECT ||
    currentStatus === CARD_STATUS.WRONG;
  const recordedQuality = session.ratings[session.currentIndex] ?? null;
  const completedCount =
    session.counts.correct + session.counts.wrong + session.counts.skipped;

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

  const {
    presentation,
    runKey,
    isLocked,
    begin,
    reset,
    actions,
    cardRef,
    onCardAnimationComplete,
    card: cardPresentation,
    segments,
  } = useRatingPresentation({
    artifactId: artifact.id,
    session,
    readOnly,
    reviewCard,
    onCommitted: (quality) => {
      if (quality === null) {
        announce(
          t('ai.artifacts.flashcards.announce.skipped', {
            done: completedCount + 1,
            count: session.totalCards,
          })
        );
      } else {
        announce(
          t('ai.artifacts.flashcards.announce.rated', {
            rating: t(RATING_LABEL_KEY[quality]),
            done: completedCount + 1,
            count: session.totalCards,
          })
        );
      }
    },
    onError: () => toast.error(t('ai.artifacts.flashcards.reviewError')),
  });

  const handleRate = useCallback(
    (quality: SM2Quality) =>
      begin(
        quality,
        quality >= SM2_QUALITY.GOOD ? CARD_STATUS.CORRECT : CARD_STATUS.WRONG
      ),
    [begin]
  );

  const handleSkip = useCallback(
    () => begin(null, CARD_STATUS.SKIPPED),
    [begin]
  );

  const handleShuffle = () => {
    if (!reset()) {
      return;
    }
    session.shuffle();
    announce(t('ai.artifacts.flashcards.announce.shuffled'));
  };

  const isAdvancedRating = session.isAdvancedMode && !readOnly;

  useStudyKeyboard({
    enabled: !session.isComplete && session.totalCards > 0,
    insideFocusDialog: true,
    isAdvancedMode: isAdvancedRating,
    flipped: session.flipped,
    isBusy: isLocked,
    onFlip: actions.flip,
    onNavigate: actions.navigate,
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
          onRestart={actions.restart}
          onBackToNote={onClose}
        />
      );
    }

    if (!session.currentCard) {
      return null;
    }

    return (
      <div
        className="my-auto flex min-w-0 flex-col gap-4"
        aria-busy={presentation ? 'true' : undefined}
      >
        <div className="relative -mx-1 overflow-x-hidden px-1 py-1">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={`${runKey}:${cardPresentation.identity}`}
              {...cardPresentation.motion}
              onAnimationComplete={onCardAnimationComplete}
            >
              <FlashcardCard
                ref={cardRef}
                front={session.currentCard.front}
                back={session.currentCard.back}
                difficulty={session.currentCard.difficulty}
                flipped={session.flipped}
                onFlip={actions.flip}
                keyShortcuts={STUDY_CARD_SHORTCUTS}
                {...(cardPresentation.verdict
                  ? { verdict: cardPresentation.verdict }
                  : {})}
                showPile={session.currentIndex < session.totalCards - 1}
                index={session.currentIndex}
                total={session.totalCards}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex min-h-16 flex-col items-center justify-center gap-3">
          {session.flipped && isCurrentCardPending ? (
            <FlashcardRating
              isAdvancedMode={session.isAdvancedMode}
              readOnly={readOnly}
              disabled={Boolean(presentation)}
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
              disabled={Boolean(presentation)}
              onClick={actions.reviewSkipped}
            >
              {t('ai.artifacts.flashcards.reviewCard')}
            </Button>
          ) : null}
          {session.flipped && isCurrentCardRated && recordedQuality !== null ? (
            <>
              <p className="text-sm text-(--muted-foreground)">
                {t('ai.artifacts.flashcards.recorded', {
                  rating: t(RATING_LABEL_KEY[recordedQuality]),
                })}
              </p>
              <Button
                variant="outline"
                className="min-h-12"
                disabled={Boolean(presentation)}
                onClick={actions.continue}
              >
                {t('ai.artifacts.flashcards.continueStudying')}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    );
  };

  const settledSegmentCount = segments.filter(
    (segment) => segment !== 'pending' && segment !== 'current'
  ).length;

  return (
    <StudyFocusDialog
      tool={STUDY_TOOL.FLASHCARDS}
      title={artifact.title}
      progress={{
        segments,
        label: t('ai.artifacts.focus.trackLabel', {
          done: settledSegmentCount,
          count: session.totalCards,
        }),
      }}
      inProgress={completedCount > 0 && !session.isComplete}
      onClose={onClose}
      menu={
        session.isComplete || session.totalCards === 0 ? undefined : (
          <FlashcardMenu
            isAdvancedMode={session.isAdvancedMode}
            disabled={Boolean(presentation)}
            onToggleAdvanced={session.toggleAdvanced}
            onRestart={() => actions.restart()}
            onShuffle={handleShuffle}
            readOnly={readOnly}
          />
        )
      }
      actions={
        !session.isComplete && session.currentCard ? (
          <FlashcardNav
            canGoPrev={!presentation && session.currentIndex > 0}
            canGoNext={
              !presentation && session.currentIndex < session.totalCards - 1
            }
            canSkip={!presentation && isCurrentCardPending}
            onNavigatePrev={() => actions.navigate(-1)}
            onNavigateNext={() => actions.navigate(1)}
            onSkip={() => void handleSkip()}
          />
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
