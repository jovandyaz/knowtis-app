import { useTranslation } from 'react-i18next';

import { Check, SkipForward, X } from 'lucide-react';
import { motion } from 'motion/react';

import {
  DonutChart,
  StatTile,
  useMotionPreset,
  type DonutSegment,
} from '@knowtis/design-system';
import type { RestartFilter, StudySessionResult } from '@knowtis/shared-types';

import { MissedCardsList } from './MissedCardsList';
import { PracticeAgainButton } from './PracticeAgainButton';

interface FlashcardSummaryProps {
  result: StudySessionResult;
  onRestart: (filter: RestartFilter) => void;
}

const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

const MOTIVATIONAL_THRESHOLDS = [
  { min: 90, key: 'ai.artifacts.flashcards.summary.excellentMastery' },
  { min: 70, key: 'ai.artifacts.flashcards.summary.greatJob' },
  { min: 50, key: 'ai.artifacts.flashcards.summary.goodProgress' },
  { min: 30, key: 'ai.artifacts.flashcards.summary.keepPracticing' },
  { min: 0, key: 'ai.artifacts.flashcards.summary.nextTimeBetter' },
] as const;

function formatDuration(ms: number): { minutes: number; seconds: number } {
  const totalSeconds = Math.floor(ms / MS_PER_SECOND);
  return {
    minutes: Math.floor(totalSeconds / SECONDS_PER_MINUTE),
    seconds: totalSeconds % SECONDS_PER_MINUTE,
  };
}

export function FlashcardSummary({ result, onRestart }: FlashcardSummaryProps) {
  const { t } = useTranslation('notes');
  const preset = useMotionPreset();

  const percentage =
    result.total > 0 ? Math.round((result.correct / result.total) * 100) : 0;
  const timeSpent = t(
    'ai.artifacts.flashcards.summary.timeSpent',
    formatDuration(result.durationMs)
  );

  const segments: DonutSegment[] = [
    {
      value: result.correct,
      tone: 'correct',
      label: t('ai.artifacts.flashcards.summary.gotIt'),
    },
    {
      value: result.wrong,
      tone: 'incorrect',
      label: t('ai.artifacts.flashcards.summary.missedIt'),
    },
    {
      value: result.skipped,
      tone: 'muted',
      label: t('ai.artifacts.flashcards.summary.skipped'),
    },
  ];

  const stats = [
    {
      label: t('ai.artifacts.flashcards.summary.gotIt'),
      value: result.correct,
      icon: <Check className="h-4 w-4 text-learn-correct-text" />,
    },
    {
      label: t('ai.artifacts.flashcards.summary.missedIt'),
      value: result.wrong,
      icon: <X className="h-4 w-4 text-learn-incorrect-text" />,
    },
    {
      label: t('ai.artifacts.flashcards.summary.skipped'),
      value: result.skipped,
      icon: <SkipForward className="h-4 w-4" />,
    },
  ];

  return (
    <div className="flex min-w-0 flex-col items-center gap-6 py-4">
      <motion.h2
        className="text-center text-xl font-semibold"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={preset.fade}
      >
        {t(
          (
            MOTIVATIONAL_THRESHOLDS.find((th) => percentage >= th.min) ??
            MOTIVATIONAL_THRESHOLDS[MOTIVATIONAL_THRESHOLDS.length - 1]
          ).key
        )}
      </motion.h2>

      <div className="flex w-full flex-col items-center gap-6 sm:flex-row sm:justify-center sm:gap-8">
        <DonutChart
          segments={segments}
          description={t('ai.artifacts.flashcards.summaryDescription', {
            percentage,
            correct: result.correct,
            wrong: result.wrong,
            skipped: result.skipped,
            duration: timeSpent,
          })}
          centerLabel={`${result.correct}/${result.total}`}
          centerSublabel={`${percentage}%`}
        >
          {timeSpent}
        </DonutChart>

        <div className="grid w-full max-w-sm grid-cols-1 gap-3 sm:grid-cols-3">
          {stats.map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...preset.fade, delay: index * preset.stagger }}
            >
              <StatTile
                label={stat.label}
                value={stat.value}
                icon={stat.icon}
              />
            </motion.div>
          ))}
        </div>
      </div>

      <div className="w-full">
        <MissedCardsList cards={result.cardResults} />
      </div>

      <PracticeAgainButton
        hasMissedCards={result.wrong > 0}
        hasSkippedCards={result.skipped > 0}
        onRestart={onRestart}
      />
    </div>
  );
}
