import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { RotateCcw, Trophy } from 'lucide-react';
import { toast } from 'sonner';

import { useSubmitQuiz } from '@knowtis/data-access-artifacts';
import {
  AnswerOption,
  Button,
  Progress,
  type AnswerOutcome,
  type ProgressProps,
} from '@knowtis/design-system';
import type { QuizArtifact } from '@knowtis/shared-types';

const QUIZ_SCORE_THRESHOLD = {
  GOOD: 70,
  FAIR: 40,
} as const;

const PERCENT = 100;
const LETTER_A_CHAR_CODE = 65;

const ANSWER_OUTCOME = {
  CORRECT: 'correct',
  INCORRECT: 'incorrect',
} as const satisfies Record<string, AnswerOutcome>;

const SCORE_TONE = {
  GOOD: ANSWER_OUTCOME.CORRECT,
  FAIR: 'primary',
  POOR: ANSWER_OUTCOME.INCORRECT,
} as const satisfies Record<string, ProgressProps['tone']>;

const ARROW_KEY_STEP: Record<string, number> = {
  ArrowDown: 1,
  ArrowRight: 1,
  ArrowUp: -1,
  ArrowLeft: -1,
};

const OUTCOME_FEEDBACK = {
  correct: {
    key: 'ai.artifacts.quiz.outcomeCorrect',
    className: 'text-learn-correct-text',
  },
  incorrect: {
    key: 'ai.artifacts.quiz.outcomeIncorrect',
    className: 'text-learn-incorrect-text',
  },
} as const satisfies Record<AnswerOutcome, { key: string; className: string }>;

function scoreTone(percentage: number): ProgressProps['tone'] {
  if (percentage >= QUIZ_SCORE_THRESHOLD.GOOD) {
    return SCORE_TONE.GOOD;
  }
  if (percentage >= QUIZ_SCORE_THRESHOLD.FAIR) {
    return SCORE_TONE.FAIR;
  }
  return SCORE_TONE.POOR;
}

interface QuizSessionProps {
  artifact: QuizArtifact;
  readOnly?: boolean | undefined;
}

interface QuizAnswer {
  questionIndex: number;
  selectedIndex: number;
}

export function QuizSession({ artifact, readOnly }: QuizSessionProps) {
  const { t } = useTranslation('notes');
  const content = artifact.content;
  const submitQuiz = useSubmitQuiz(artifact.id);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [completed, setCompleted] = useState(false);
  const [score, setScore] = useState(0);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const totalQuestions = content.questions.length;
  const currentQuestion = content.questions[currentIndex];

  const handleSelect = useCallback(
    (optionIndex: number) => {
      if (answered) {
        return;
      }
      setSelectedOption(optionIndex);
      setAnswered(true);

      const isCorrect = optionIndex === currentQuestion.correctIndex;
      if (isCorrect) {
        setScore((prev) => prev + 1);
      }

      setAnswers((prev) => [
        ...prev,
        { questionIndex: currentIndex, selectedIndex: optionIndex },
      ]);
    },
    [answered, currentIndex, currentQuestion]
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (answered || readOnly || !currentQuestion) {
        return;
      }
      const step = ARROW_KEY_STEP[event.key];
      if (step === undefined) {
        return;
      }
      event.preventDefault();

      const optionCount = currentQuestion.options.length;
      const nextIndex =
        ((selectedOption ?? 0) + step + optionCount) % optionCount;
      optionRefs.current[nextIndex]?.focus();
      handleSelect(nextIndex);
    },
    [answered, readOnly, currentQuestion, selectedOption, handleSelect]
  );

  const handleNext = useCallback(() => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setAnswered(false);
    } else {
      setCompleted(true);
      if (!readOnly) {
        void submitQuiz.mutateAsync({ answers: [...answers] }).catch(() => {
          toast.error(t('ai.artifacts.quiz.submitError'));
        });
      }
    }
  }, [currentIndex, totalQuestions, answers, submitQuiz, t, readOnly]);

  const handleRestart = useCallback(() => {
    setCurrentIndex(0);
    setSelectedOption(null);
    setAnswered(false);
    setAnswers([]);
    setCompleted(false);
    setScore(0);
  }, []);

  if (completed) {
    const percentage =
      totalQuestions > 0 ? Math.round((score / totalQuestions) * PERCENT) : 0;
    const scoreLabel = t('ai.artifacts.quiz.scoreText', {
      score,
      total: totalQuestions,
      percentage,
    });

    return (
      <div className="flex flex-col items-center space-y-6 py-8">
        <Trophy className="h-16 w-16 text-(--primary)" />
        <h3 className="text-2xl font-bold">
          {t('ai.artifacts.quiz.completed')}
        </h3>
        <p className="text-lg text-(--muted-foreground)">{scoreLabel}</p>
        <Progress
          className="h-4 w-48"
          value={percentage}
          max={PERCENT}
          label={scoreLabel}
          tone={scoreTone(percentage)}
        />
        <Button variant="outline" onClick={handleRestart}>
          <RotateCcw className="mr-2 h-4 w-4" />
          {t('ai.artifacts.quiz.tryAgain')}
        </Button>
      </div>
    );
  }

  if (!currentQuestion) {
    return null;
  }

  const { correctIndex } = currentQuestion;
  const positionLabel = t('ai.artifacts.quiz.questionOf', {
    current: currentIndex + 1,
    total: totalQuestions,
  });
  const rovingIndex = selectedOption ?? 0;

  const outcomeFor = (index: number): AnswerOutcome | undefined => {
    if (!answered) {
      return undefined;
    }
    if (index === correctIndex) {
      return ANSWER_OUTCOME.CORRECT;
    }
    return selectedOption === index ? ANSWER_OUTCOME.INCORRECT : undefined;
  };

  const pickedOutcome =
    selectedOption === null ? undefined : outcomeFor(selectedOption);
  const feedback = pickedOutcome ? OUTCOME_FEEDBACK[pickedOutcome] : null;

  return (
    <div className="space-y-6">
      <p className="text-sm text-(--muted-foreground)">{positionLabel}</p>

      <Progress
        value={currentIndex + 1}
        max={totalQuestions}
        label={positionLabel}
      />

      <div className="rounded-lg border border-(--border) bg-(--card) p-6">
        <p className="text-base font-medium">{currentQuestion.question}</p>
      </div>

      <div
        role="radiogroup"
        aria-label={currentQuestion.question}
        className="space-y-3"
      >
        {currentQuestion.options.map((option, index) => {
          const optionOutcome = outcomeFor(index);
          return (
            <AnswerOption
              key={index}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              index={index}
              selected={selectedOption === index}
              {...(optionOutcome ? { outcome: optionOutcome } : {})}
              disabled={answered || readOnly}
              tabIndex={index === rovingIndex ? 0 : -1}
              onKeyDown={handleKeyDown}
              onSelect={() => handleSelect(index)}
            >
              {option}
            </AnswerOption>
          );
        })}
      </div>

      <div role="status" aria-live="polite">
        {feedback && (
          <p className={`text-sm font-medium ${feedback.className}`}>
            {t(feedback.key, {
              letter: String.fromCharCode(LETTER_A_CHAR_CODE + correctIndex),
              answer: currentQuestion.options[correctIndex],
            })}
          </p>
        )}
      </div>

      {answered && currentQuestion.explanation && (
        <div className="rounded-lg border border-(--border) bg-(--muted)/50 p-4">
          <p className="text-sm font-medium">
            {t('ai.artifacts.quiz.explanation')}
          </p>
          <p className="mt-1 text-sm text-(--muted-foreground)">
            {currentQuestion.explanation}
          </p>
        </div>
      )}

      {answered && (
        <div className="flex justify-end">
          <Button onClick={handleNext}>
            {currentIndex < totalQuestions - 1
              ? t('ai.artifacts.quiz.next')
              : t('ai.artifacts.quiz.finish')}
          </Button>
        </div>
      )}
    </div>
  );
}
