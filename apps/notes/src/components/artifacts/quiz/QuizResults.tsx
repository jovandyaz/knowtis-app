import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { motion } from 'motion/react';

import {
  Button,
  cn,
  DonutChart,
  StatTile,
  useMotionPreset,
} from '@knowtis/design-system';
import {
  QUIZ_ATTEMPT_SCOPE,
  type QuizAttemptScope,
  type QuizContent,
} from '@knowtis/shared-types';

import { SessionCelebration } from '../focus/SessionCelebration';
import { scoreTone } from './quiz-score';
import { QuizReviewList } from './QuizReviewList';
import type { QuizAnswerRecord } from './use-quiz-session';

const PERCENT = 100;
const SCORE_CLASS = {
  primary: 'text-(--foreground)',
  correct: 'text-learn-correct-text',
  incorrect: 'text-learn-incorrect-text',
  danger: 'text-(--destructive)',
} as const;

interface QuizResultsProps {
  score: number;
  total: number;
  scope: QuizAttemptScope;
  readOnly?: boolean | undefined;
  submissionSucceeded: boolean;
  answers: QuizAnswerRecord[];
  questions: QuizContent['questions'];
  onRetryMissed: () => void;
  onRestart: () => void;
  onBackToNote: () => void;
}

export function QuizResults({
  score,
  total,
  scope,
  readOnly,
  submissionSucceeded,
  answers,
  questions,
  onRetryMissed,
  onRestart,
  onBackToNote,
}: QuizResultsProps) {
  const { t } = useTranslation('notes');
  const preset = useMotionPreset();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const missed = total - score;
  const canRetryMissed =
    missed > 0 &&
    scope === QUIZ_ATTEMPT_SCOPE.FULL &&
    (readOnly || submissionSucceeded);
  const percentage = total > 0 ? Math.round((score / total) * PERCENT) : 0;

  // Each mount is a finished run; expanding review rows must not move focus.
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="relative flex flex-col gap-6">
      <SessionCelebration />
      <h2
        ref={headingRef}
        tabIndex={-1}
        className="text-center text-2xl font-semibold outline-none"
      >
        {t('ai.artifacts.quiz.completed')}
      </h2>
      {scope === QUIZ_ATTEMPT_SCOPE.MISSED && (
        <p className="self-center rounded-full bg-(--muted) px-3 py-1 text-sm">
          {t('ai.artifacts.quiz.missedPractice')}
        </p>
      )}
      <div className="flex flex-col items-center justify-center gap-6 sm:flex-row">
        <DonutChart
          segments={[
            { value: score, tone: 'correct' },
            { value: missed, tone: 'incorrect' },
          ]}
          description={t('ai.artifacts.quiz.resultsDescription', {
            correct: score,
            total,
            incorrect: missed,
            percentage,
          })}
          centerLabel={`${score}/${total}`}
          centerSublabel={`${percentage}%`}
        />
        <div className="grid w-full grid-cols-2 gap-3 sm:w-auto">
          {[
            { value: score, label: t('ai.artifacts.quiz.correctCount') },
            { value: missed, label: t('ai.artifacts.quiz.incorrectCount') },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={preset.reduced ? false : { opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ ...preset.fade, delay: index * preset.stagger }}
            >
              <StatTile value={stat.value} label={stat.label} />
            </motion.div>
          ))}
        </div>
      </div>
      <p
        className={cn(
          'text-center text-lg',
          SCORE_CLASS[scoreTone(percentage)]
        )}
      >
        {t('ai.artifacts.quiz.accuracy', { percentage })}
      </p>
      <QuizReviewList answers={answers} questions={questions} />
      {missed === 0 && (
        <p className="text-center text-base text-learn-correct-text">
          {t('ai.artifacts.quiz.allCorrect')}
        </p>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:justify-center">
        <Button
          size="lg"
          variant="outline"
          className="h-auto min-h-12 whitespace-normal"
          onClick={onBackToNote}
        >
          {t('ai.artifacts.focus.backToNote')}
        </Button>
        {canRetryMissed && (
          <Button
            size="lg"
            className="h-auto min-h-12 whitespace-normal"
            onClick={onRetryMissed}
          >
            {t('ai.artifacts.quiz.retryMissed', { count: missed })}
          </Button>
        )}
        <Button
          size="lg"
          variant="outline"
          className="h-auto min-h-12 whitespace-normal"
          onClick={onRestart}
        >
          {t('ai.artifacts.quiz.tryAgain')}
        </Button>
      </div>
    </div>
  );
}
