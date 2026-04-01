import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { Check, SkipForward, X } from 'lucide-react';
import { motion } from 'motion/react';

import type { RestartFilter, StudySessionResult } from '@knowtis/shared-types';

import { DonutChart } from './DonutChart';
import { MissedCardsList } from './MissedCardsList';
import { PracticeAgainButton } from './PracticeAgainButton';

interface FlashcardSummaryProps {
  result: StudySessionResult;
  onRestart: (filter: RestartFilter) => void;
}

const CORRECT_COLOR = 'oklch(0.75 0.18 155)';
const WRONG_COLOR = 'oklch(0.65 0.2 25)';
const SKIPPED_COLOR = 'oklch(0.55 0.01 90)';

const MOTIVATIONAL_THRESHOLDS = [
  { min: 90, key: 'ai.artifacts.flashcards.summary.excellentMastery' },
  { min: 70, key: 'ai.artifacts.flashcards.summary.greatJob' },
  { min: 50, key: 'ai.artifacts.flashcards.summary.goodProgress' },
  { min: 30, key: 'ai.artifacts.flashcards.summary.keepPracticing' },
  { min: 0, key: 'ai.artifacts.flashcards.summary.nextTimeBetter' },
] as const;

function formatDuration(ms: number): { minutes: number; seconds: number } {
  const totalSeconds = Math.floor(ms / 1000);
  return {
    minutes: Math.floor(totalSeconds / 60),
    seconds: totalSeconds % 60,
  };
}

export function FlashcardSummary({ result, onRestart }: FlashcardSummaryProps) {
  const { t } = useTranslation('notes');

  const answered = result.correct + result.wrong;
  const percentage =
    answered > 0 ? Math.round((result.correct / answered) * 100) : 0;
  const hasMissedCards = result.wrong > 0;
  const duration = formatDuration(result.durationMs);

  const segments = useMemo(
    () => [
      { value: result.correct, color: CORRECT_COLOR },
      { value: result.wrong, color: WRONG_COLOR },
      { value: result.skipped, color: SKIPPED_COLOR },
    ],
    [result.correct, result.wrong, result.skipped]
  );

  const stats = [
    {
      icon: Check,
      label: t('ai.artifacts.flashcards.summary.gotIt'),
      count: result.correct,
      color: 'text-green-500',
    },
    {
      icon: X,
      label: t('ai.artifacts.flashcards.summary.missedIt'),
      count: result.wrong,
      color: 'text-destructive',
    },
    {
      icon: SkipForward,
      label: t('ai.artifacts.flashcards.summary.skipped'),
      count: result.skipped,
      color: 'text-muted-foreground',
    },
  ];

  return (
    <div className="flex flex-col items-center gap-6 py-4 min-w-0">
      <motion.h2
        className="text-xl font-semibold text-foreground text-center"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4 }}
      >
        {t(
          (
            MOTIVATIONAL_THRESHOLDS.find((th) => percentage >= th.min) ??
            MOTIVATIONAL_THRESHOLDS[MOTIVATIONAL_THRESHOLDS.length - 1]
          ).key
        )}
      </motion.h2>

      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:gap-8">
        <DonutChart
          segments={segments}
          centerLabel={`${result.correct}/${result.total}`}
          centerSublabel={`${percentage}%`}
          centerDetail={t(
            'ai.artifacts.flashcards.summary.timeSpent',
            duration
          )}
        />

        <div className="flex flex-col gap-3">
          {stats.map(({ icon: Icon, label, count, color }, i) => (
            <motion.div
              key={label}
              className="flex items-center gap-3"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + i * 0.1, duration: 0.3 }}
            >
              <Icon className={`h-4 w-4 ${color}`} />
              <span className="text-sm text-muted-foreground min-w-[70px]">
                {label}
              </span>
              <span className={`text-sm font-semibold ${color}`}>{count}</span>
            </motion.div>
          ))}
        </div>
      </div>

      <div className="w-full">
        <MissedCardsList cards={result.cardResults} />
      </div>

      <PracticeAgainButton
        hasMissedCards={hasMissedCards}
        hasSkippedCards={result.skipped > 0}
        onRestart={onRestart}
      />
    </div>
  );
}
