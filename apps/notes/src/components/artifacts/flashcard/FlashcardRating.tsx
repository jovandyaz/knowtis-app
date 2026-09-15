import { useTranslation } from 'react-i18next';

import { Check, X } from 'lucide-react';

import { Button, cn, learnToneButton, RatingBar } from '@knowtis/design-system';
import type { PredictedIntervals, SM2Quality } from '@knowtis/shared-types';

interface FlashcardRatingProps {
  isAdvancedMode: boolean;
  readOnly?: boolean | undefined;
  disabled: boolean;
  intervals?: PredictedIntervals | undefined;
  showKeys?: boolean | undefined;
  onWrong: () => void;
  onCorrect: () => void;
  onRateAdvanced: (quality: SM2Quality) => void;
}

/** Every rating schedules the card for tomorrow until a caller passes per-card `intervals`. */
const FIRST_REVIEW_INTERVALS: PredictedIntervals = {
  again: 1,
  hard: 1,
  good: 1,
  easy: 1,
};

const RATE_BUTTON_LAYOUT =
  'min-h-12 min-w-0 rounded-full px-3 py-2.5 whitespace-normal sm:px-6';

const SIMPLE_MODE_KEYS = { wrong: '1', correct: '2' } as const;

export function FlashcardRating({
  isAdvancedMode,
  readOnly,
  disabled,
  intervals,
  showKeys = false,
  onWrong,
  onCorrect,
  onRateAdvanced,
}: FlashcardRatingProps) {
  const { t } = useTranslation('notes');

  if (isAdvancedMode && !readOnly) {
    return (
      <RatingBar
        label={t('ai.artifacts.flashcards.rateCard')}
        intervals={intervals ?? FIRST_REVIEW_INTERVALS}
        labels={{
          again: t('ai.artifacts.flashcards.quality.again'),
          hard: t('ai.artifacts.flashcards.quality.hard'),
          good: t('ai.artifacts.flashcards.quality.good'),
          easy: t('ai.artifacts.flashcards.quality.easy'),
        }}
        formatInterval={(days) =>
          t('ai.artifacts.flashcards.intervalDays', { count: days })
        }
        onRate={onRateAdvanced}
        disabled={disabled}
        showKeys={showKeys}
      />
    );
  }

  return (
    <div className="grid w-full grid-cols-2 gap-2 sm:gap-4">
      <Button
        variant="ghost"
        className={cn(
          RATE_BUTTON_LAYOUT,
          learnToneButton({ tone: 'incorrect' })
        )}
        onClick={onWrong}
        disabled={disabled}
        aria-keyshortcuts={showKeys ? SIMPLE_MODE_KEYS.wrong : undefined}
      >
        <X aria-hidden="true" className="h-4 w-4 shrink-0" />
        {t('ai.artifacts.flashcards.wrong')}
      </Button>

      <Button
        variant="ghost"
        className={cn(RATE_BUTTON_LAYOUT, learnToneButton({ tone: 'correct' }))}
        onClick={onCorrect}
        disabled={disabled}
        aria-keyshortcuts={showKeys ? SIMPLE_MODE_KEYS.correct : undefined}
      >
        <Check aria-hidden="true" className="h-4 w-4 shrink-0" />
        {t('ai.artifacts.flashcards.correct')}
      </Button>
    </div>
  );
}
