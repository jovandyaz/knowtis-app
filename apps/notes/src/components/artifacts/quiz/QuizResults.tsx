import { useTranslation } from 'react-i18next';

import { ChevronDown } from 'lucide-react';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@knowtis/design-system';
import {
  QUIZ_ATTEMPT_SCOPE,
  type QuizAttemptScope,
  type QuizContent,
} from '@knowtis/shared-types';

import { toQuizSegments } from '../focus/study-segments';
import { StudySummary } from '../focus/StudySummary';
import { QuizReviewList } from './QuizReviewList';
import type { QuizAnswerRecord } from './use-quiz-session';

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
  const missedAnswers = answers.filter((answer) => !answer.correct);
  const missed = missedAnswers.length;
  const canRetryMissed =
    missed > 0 &&
    scope === QUIZ_ATTEMPT_SCOPE.FULL &&
    (readOnly || submissionSucceeded);
  const segments = toQuizSegments(
    answers.map((answer) => (answer.correct ? 'correct' : 'incorrect')),
    -1,
    true
  );
  const celebrate =
    total > 0 &&
    score === total &&
    answers.length === total &&
    answers.every((answer) => answer.correct);
  const headline = t('ai.artifacts.quiz.results.headline', { score, total });

  return (
    <div className="my-auto flex min-w-0 flex-col gap-3">
      {scope === QUIZ_ATTEMPT_SCOPE.MISSED && (
        <p className="text-center font-mono text-xs leading-5 text-(--muted-foreground)">
          {t('ai.artifacts.quiz.missedPractice')}
        </p>
      )}
      <StudySummary
        headline={headline}
        segments={segments}
        legend={[
          {
            state: 'correct',
            label: t('ai.artifacts.quiz.correctCount'),
            count: score,
          },
          {
            state: 'wrong',
            label: t('ai.artifacts.quiz.incorrectCount'),
            count: missed,
          },
        ]}
        celebrate={celebrate}
        revisit={
          missed > 0 ? (
            <QuizReviewList answers={missedAnswers} questions={questions} />
          ) : undefined
        }
        primaryAction={
          <div className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-2">
            <Button
              size="lg"
              className={`h-auto min-h-12 min-w-0 whitespace-normal py-3 text-center ${
                canRetryMissed ? '' : 'col-span-2'
              }`}
              onClick={canRetryMissed ? onRetryMissed : onRestart}
            >
              {canRetryMissed
                ? t('ai.artifacts.quiz.retryMissed', { count: missed })
                : t('ai.artifacts.quiz.tryAgain')}
            </Button>
            {canRetryMissed ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-12 min-h-12 w-12 min-w-12 p-0"
                    aria-label={t(
                      'ai.artifacts.flashcards.summary.practiceOptions'
                    )}
                  >
                    <ChevronDown aria-hidden="true" className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={onRestart}>
                    {t('ai.artifacts.quiz.tryAgain')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        }
        secondaryAction={
          <Button
            size="lg"
            variant="ghost"
            className="h-auto min-h-12 whitespace-normal"
            onClick={onBackToNote}
          >
            {t('ai.artifacts.focus.backToNote')}
          </Button>
        }
      />
    </div>
  );
}
