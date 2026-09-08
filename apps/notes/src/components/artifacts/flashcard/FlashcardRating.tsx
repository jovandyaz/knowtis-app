import { useTranslation } from 'react-i18next';

import { Check, X } from 'lucide-react';
import { motion } from 'motion/react';

import {
  Button,
  cn,
  learnToneButton,
  RatingBar,
  useMotionPreset,
} from '@knowtis/design-system';
import type { PredictedIntervals, SM2Quality } from '@knowtis/shared-types';

interface FlashcardRatingProps {
  isAdvancedMode: boolean;
  readOnly?: boolean | undefined;
  disabled: boolean;
  onWrong: () => void;
  onCorrect: () => void;
  onRateAdvanced: (quality: SM2Quality) => void;
}

/** Every rating schedules the card for tomorrow until the server predicts per-card intervals. */
const FIRST_REVIEW_INTERVALS: PredictedIntervals = {
  again: 1,
  hard: 1,
  good: 1,
  easy: 1,
};

const RATE_BUTTON_LAYOUT = 'min-h-11 rounded-full px-6 py-2.5';

export function FlashcardRating({
  isAdvancedMode,
  readOnly,
  disabled,
  onWrong,
  onCorrect,
  onRateAdvanced,
}: FlashcardRatingProps) {
  const { t } = useTranslation('notes');
  const preset = useMotionPreset();

  if (isAdvancedMode && !readOnly) {
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

  return (
    <motion.div
      className="flex items-center justify-center gap-4 pb-1"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={preset.fade}
    >
      <Button
        variant="ghost"
        className={cn(
          RATE_BUTTON_LAYOUT,
          learnToneButton({ tone: 'incorrect' })
        )}
        onClick={onWrong}
        disabled={disabled}
      >
        <X className="h-4 w-4" />
        {t('ai.artifacts.flashcards.wrong')}
      </Button>

      <Button
        variant="ghost"
        className={cn(RATE_BUTTON_LAYOUT, learnToneButton({ tone: 'correct' }))}
        onClick={onCorrect}
        disabled={disabled}
      >
        <Check className="h-4 w-4" />
        {t('ai.artifacts.flashcards.correct')}
      </Button>
    </motion.div>
  );
}
