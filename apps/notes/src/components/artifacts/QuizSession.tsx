import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { CheckCircle2, RotateCcw, Trophy, XCircle } from 'lucide-react';
import { toast } from 'sonner';

import { useSubmitQuiz } from '@knowtis/data-access-artifacts';
import { Button } from '@knowtis/design-system';
import type { QuizArtifact } from '@knowtis/shared-types';

const QUIZ_SCORE_THRESHOLD = {
  GOOD: 70,
  FAIR: 40,
} as const;

interface QuizSessionProps {
  artifact: QuizArtifact;
}

interface QuizAnswer {
  questionIndex: number;
  selectedIndex: number;
}

export function QuizSession({ artifact }: QuizSessionProps) {
  const { t } = useTranslation('notes');
  const content = artifact.content;
  const submitQuiz = useSubmitQuiz(artifact.id);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [answered, setAnswered] = useState(false);
  const [answers, setAnswers] = useState<QuizAnswer[]>([]);
  const [completed, setCompleted] = useState(false);
  const [score, setScore] = useState(0);

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

  const handleNext = useCallback(() => {
    if (currentIndex < totalQuestions - 1) {
      setCurrentIndex((prev) => prev + 1);
      setSelectedOption(null);
      setAnswered(false);
    } else {
      setCompleted(true);
      submitQuiz.mutate(
        { answers: [...answers] },
        {
          onError: () => {
            toast.error(t('ai.artifacts.quiz.submitError'));
          },
        }
      );
    }
  }, [currentIndex, totalQuestions, answers, submitQuiz, t]);

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
      totalQuestions > 0 ? Math.round((score / totalQuestions) * 100) : 0;

    return (
      <div className="flex flex-col items-center space-y-6 py-8">
        <Trophy className="h-16 w-16 text-primary" />
        <h3 className="text-2xl font-bold text-foreground">
          {t('ai.artifacts.quiz.completed')}
        </h3>
        <p className="text-lg text-muted-foreground">
          {t('ai.artifacts.quiz.scoreText', {
            score,
            total: totalQuestions,
            percentage,
          })}
        </p>
        <div className="h-4 w-48 rounded-full bg-muted">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              percentage >= QUIZ_SCORE_THRESHOLD.GOOD
                ? 'bg-green-500'
                : percentage >= QUIZ_SCORE_THRESHOLD.FAIR
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {t('ai.artifacts.quiz.questionOf', {
            current: currentIndex + 1,
            total: totalQuestions,
          })}
        </span>
      </div>

      <div className="h-2 w-full rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all duration-300"
          style={{
            width: `${((currentIndex + (answered ? 1 : 0)) / totalQuestions) * 100}%`,
          }}
        />
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <p className="text-base font-medium text-foreground">
          {currentQuestion.question}
        </p>
      </div>

      <div className="space-y-3">
        {currentQuestion.options.map((option, index) => {
          const isSelected = selectedOption === index;
          const isCorrect = index === currentQuestion.correctIndex;
          const showResult = answered;

          let optionClass =
            'rounded-lg border p-4 text-left text-sm transition-all cursor-pointer';

          if (showResult) {
            if (isCorrect) {
              optionClass +=
                ' border-green-500 bg-green-500/10 text-foreground';
            } else if (isSelected && !isCorrect) {
              optionClass += ' border-red-500 bg-red-500/10 text-foreground';
            } else {
              optionClass +=
                ' border-border bg-card text-muted-foreground opacity-60';
            }
          } else {
            optionClass +=
              ' border-border bg-card text-foreground hover:border-primary/50 hover:bg-muted';
          }

          return (
            <button
              key={index}
              type="button"
              className={`flex w-full items-center gap-3 ${optionClass}`}
              onClick={() => handleSelect(index)}
              disabled={answered}
            >
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border bg-muted text-xs font-medium">
                {String.fromCharCode(65 + index)}
              </span>
              <span className="flex-1">{option}</span>
              {showResult && isCorrect && (
                <CheckCircle2 className="h-5 w-5 shrink-0 text-green-500" />
              )}
              {showResult && isSelected && !isCorrect && (
                <XCircle className="h-5 w-5 shrink-0 text-red-500" />
              )}
            </button>
          );
        })}
      </div>

      {answered && currentQuestion.explanation && (
        <div className="rounded-lg border border-border bg-muted/50 p-4">
          <p className="text-sm font-medium text-foreground">
            {t('ai.artifacts.quiz.explanation')}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
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
