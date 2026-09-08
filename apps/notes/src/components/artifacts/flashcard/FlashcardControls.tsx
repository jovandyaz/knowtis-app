import { useTranslation } from 'react-i18next';

import { Check, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import {
  Button,
  RatingBar,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  useMotionPreset,
} from '@knowtis/design-system';
import type { PredictedIntervals, SM2Quality } from '@knowtis/shared-types';

interface FlashcardControlsProps {
  isAdvancedMode: boolean;
  isFlipped: boolean;
  readOnly?: boolean | undefined;
  onWrong: () => void;
  onCorrect: () => void;
  onNavigatePrev: () => void;
  onNavigateNext: () => void;
  onRateAdvanced: (quality: SM2Quality) => void;
  wrongCount: number;
  correctCount: number;
  disabled: boolean;
  canGoPrev: boolean;
}

/** Every rating schedules the card for tomorrow until the server predicts per-card intervals. */
const FIRST_REVIEW_INTERVALS: PredictedIntervals = {
  again: 1,
  hard: 1,
  good: 1,
  easy: 1,
};

const RATE_BUTTON_BASE =
  'rounded-full px-6 py-2.5 ring-1 transition-colors duration-(--motion-duration-fast) ease-standard motion-reduce:transition-none';
const WRONG_BUTTON = `${RATE_BUTTON_BASE} bg-learn-incorrect/15 text-learn-incorrect-text ring-learn-incorrect/25 hover:bg-learn-incorrect/25`;
const CORRECT_BUTTON = `${RATE_BUTTON_BASE} bg-learn-correct/15 text-learn-correct-text ring-learn-correct/25 hover:bg-learn-correct/25`;

function AnimatedCounter({ count }: { count: number }) {
  const preset = useMotionPreset();
  return (
    <AnimatePresence mode="wait">
      <motion.span
        key={count}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={preset.fade}
        className="text-sm font-semibold tabular-nums"
      >
        {count}
      </motion.span>
    </AnimatePresence>
  );
}

export function FlashcardControls({
  isAdvancedMode,
  isFlipped,
  readOnly,
  onWrong,
  onCorrect,
  onNavigatePrev,
  onNavigateNext,
  onRateAdvanced,
  wrongCount,
  correctCount,
  disabled,
  canGoPrev,
}: FlashcardControlsProps) {
  const { t } = useTranslation('notes');
  const preset = useMotionPreset();

  if (isFlipped && isAdvancedMode && !readOnly) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={preset.fade}
      >
        <RatingBar
          label={t('ai.artifacts.flashcards.rateCard')}
          intervals={FIRST_REVIEW_INTERVALS}
          labels={{
            again: t('ai.artifacts.flashcards.quality.again'),
            hard: t('ai.artifacts.flashcards.quality.hard'),
            good: t('ai.artifacts.flashcards.quality.good'),
            easy: t('ai.artifacts.flashcards.quality.easy'),
          }}
          formatInterval={(days) => `${days}d`}
          onRate={onRateAdvanced}
          disabled={disabled}
        />
      </motion.div>
    );
  }

  if (isFlipped) {
    return (
      <motion.div
        className="flex items-center justify-center gap-4 pb-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={preset.fade}
      >
        <Button
          variant="ghost"
          className={WRONG_BUTTON}
          onClick={onWrong}
          disabled={disabled}
        >
          <X className="h-4 w-4" />
          {t('ai.artifacts.flashcards.wrong')}
        </Button>

        <Button
          variant="ghost"
          className={CORRECT_BUTTON}
          onClick={onCorrect}
          disabled={disabled}
        >
          <Check className="h-4 w-4" />
          {t('ai.artifacts.flashcards.correct')}
        </Button>
      </motion.div>
    );
  }

  return (
    <div className="flex items-center justify-center gap-3">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={onNavigatePrev}
            disabled={!canGoPrev}
            aria-label={t('ai.artifacts.flashcards.prev')}
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('ai.artifacts.flashcards.prev')}</TooltipContent>
      </Tooltip>

      <div className="flex items-center gap-1.5 rounded-full bg-learn-incorrect/15 px-3 py-1.5 text-learn-incorrect-text">
        <X className="h-4 w-4" />
        <AnimatedCounter count={wrongCount} />
      </div>

      <div className="flex items-center gap-1.5 rounded-full bg-learn-correct/15 px-3 py-1.5 text-learn-correct-text">
        <AnimatedCounter count={correctCount} />
        <Check className="h-4 w-4" />
      </div>

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-full"
            onClick={onNavigateNext}
            aria-label={t('ai.artifacts.flashcards.next')}
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t('ai.artifacts.flashcards.next')}</TooltipContent>
      </Tooltip>
    </div>
  );
}
