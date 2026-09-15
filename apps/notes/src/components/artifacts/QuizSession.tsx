import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
import { useTranslation } from 'react-i18next';

import { isStudyKeyEventIgnored } from '@/hooks/study-key-guard';
import { toast } from 'sonner';

import { useSubmitQuiz } from '@knowtis/data-access-artifacts';
import {
  answerLetter,
  AnswerOption,
  Button,
  EmptyState,
  Kbd,
  type AnswerOutcome,
  type SegmentState,
} from '@knowtis/design-system';
import type { QuizArtifact } from '@knowtis/shared-types';

import { STUDY_TOOL, StudyFocusDialog } from './focus/StudyFocusDialog';
import { StudyKeyHints, type StudyKeyHint } from './focus/StudyKeyHints';
import { QuizResults } from './quiz/QuizResults';
import { useQuizSession } from './quiz/use-quiz-session';

const FIRST_OPTION = 0;
const ARROW_KEY_STEP: Partial<Record<string, number>> = {
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

interface QuizSessionProps {
  artifact: QuizArtifact;
  readOnly?: boolean | undefined;
  onClose: () => void;
}

export function QuizSession({ artifact, readOnly, onClose }: QuizSessionProps) {
  const { t } = useTranslation('notes');
  const { mutateAsync: submitQuiz } = useSubmitQuiz(artifact.id);
  const quiz = useQuizSession(artifact.content.questions);
  const {
    currentQuestion,
    selectedOption,
    checked,
    completed,
    select,
    check,
    next,
    restart,
    retryMissed,
  } = quiz;
  const [focusedIndex, setFocusedIndex] = useState(FIRST_OPTION);
  const [submissionSucceeded, setSubmissionSucceeded] = useState(false);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const advanceRef = useRef<HTMLButtonElement>(null);
  const focusOptionsRef = useRef(false);
  const hasSubmittedRef = useRef(false);
  const runIdRef = useRef(0);
  const segments: SegmentState[] = quiz.activeIndexes.map(
    (questionIndex, position) => {
      const answer = quiz.answers.find(
        (item) => item.questionIndex === questionIndex
      );
      if (answer) {
        return answer.correct ? 'correct' : 'wrong';
      }
      return !completed && position === quiz.position ? 'current' : 'pending';
    }
  );

  useEffect(() => {
    if (!completed || readOnly || hasSubmittedRef.current) {
      return;
    }
    hasSubmittedRef.current = true;
    const submittedRunId = runIdRef.current;
    void submitQuiz({
      answers: quiz.answers.map(({ questionIndex, selectedIndex }) => ({
        questionIndex,
        selectedIndex,
      })),
      scope: quiz.scope,
    })
      .then(() => {
        if (runIdRef.current === submittedRunId) {
          setSubmissionSucceeded(true);
        }
      })
      .catch(() => {
        if (runIdRef.current === submittedRunId) {
          toast.error(t('ai.artifacts.quiz.submitError'));
        }
      });
  }, [completed, readOnly, quiz.answers, quiz.scope, submitQuiz, t]);

  useEffect(() => {
    if (checked && !completed) {
      advanceRef.current?.focus();
    }
  }, [checked, completed]);

  useEffect(() => {
    if (focusOptionsRef.current && !completed) {
      focusOptionsRef.current = false;
      optionRefs.current[FIRST_OPTION]?.focus();
    }
  }, [quiz.position, quiz.scope, completed]);

  const handleNext = useCallback(() => {
    if (!checked || completed) {
      return;
    }
    focusOptionsRef.current = true;
    setFocusedIndex(FIRST_OPTION);
    next();
  }, [checked, completed, next]);

  const handleRestart = useCallback(() => {
    runIdRef.current += 1;
    setSubmissionSucceeded(false);
    hasSubmittedRef.current = false;
    focusOptionsRef.current = true;
    setFocusedIndex(FIRST_OPTION);
    restart();
  }, [restart]);

  const handleRetryMissed = useCallback(() => {
    if (quiz.missedIndexes.length === 0) {
      return;
    }
    runIdRef.current += 1;
    setSubmissionSucceeded(false);
    hasSubmittedRef.current = false;
    focusOptionsRef.current = true;
    setFocusedIndex(FIRST_OPTION);
    retryMissed();
  }, [quiz.missedIndexes.length, retryMissed]);

  const handleArrowKey = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>) => {
      if (
        checked ||
        !currentQuestion ||
        isStudyKeyEventIgnored(event.nativeEvent, true)
      ) {
        return;
      }
      const step = ARROW_KEY_STEP[event.key];
      if (step === undefined) {
        return;
      }
      event.preventDefault();
      const optionCount = currentQuestion.options.length;
      const nextIndex = (focusedIndex + step + optionCount) % optionCount;
      setFocusedIndex(nextIndex);
      select(nextIndex);
      optionRefs.current[nextIndex]?.focus();
    },
    [checked, currentQuestion, focusedIndex, select]
  );

  useLayoutEffect(() => {
    const handleKeyDown = (event: globalThis.KeyboardEvent) => {
      if (
        completed ||
        !currentQuestion ||
        event.defaultPrevented ||
        isStudyKeyEventIgnored(event, true)
      ) {
        return;
      }
      if (!checked && /^[1-5]$/.test(event.key)) {
        const option = Number(event.key) - 1;
        if (option < currentQuestion.options.length) {
          event.preventDefault();
          select(option);
          setFocusedIndex(option);
          optionRefs.current[option]?.focus();
        }
        return;
      }
      if (event.key !== 'Enter') {
        return;
      }
      const button =
        event.target instanceof HTMLElement
          ? event.target.closest('button')
          : null;
      if (
        !checked &&
        selectedOption !== null &&
        (!button || button.getAttribute('role') === 'radio')
      ) {
        event.preventDefault();
        check();
      } else if (checked && !button) {
        event.preventDefault();
        handleNext();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    checked,
    completed,
    currentQuestion,
    selectedOption,
    select,
    check,
    handleNext,
  ]);

  const hints: StudyKeyHint[] = [];
  if (!completed && currentQuestion) {
    if (!checked) {
      hints.push({
        keys: [`1–${currentQuestion.options.length}`],
        label: t('ai.artifacts.focus.hints.chooseAnswer'),
      });
      hints.push({
        keys: ['Enter'],
        label: t('ai.artifacts.focus.hints.checkAnswer'),
      });
    } else {
      hints.push({
        keys: ['Enter'],
        label: t(
          quiz.isLast
            ? 'ai.artifacts.focus.hints.viewResults'
            : 'ai.artifacts.focus.hints.nextQuestion'
        ),
      });
    }
  }
  hints.push({ keys: ['Esc'], label: t('ai.artifacts.focus.hints.exit') });

  const renderStage = () => {
    if (quiz.total === 0) {
      return (
        <EmptyState title={t('ai.artifacts.focus.emptyQuiz')} description="">
          <Button size="lg" className="min-h-12" onClick={onClose}>
            {t('ai.artifacts.focus.backToNote')}
          </Button>
        </EmptyState>
      );
    }
    if (completed) {
      return (
        <QuizResults
          score={quiz.score}
          total={quiz.total}
          scope={quiz.scope}
          readOnly={readOnly}
          submissionSucceeded={submissionSucceeded}
          answers={quiz.answers}
          questions={artifact.content.questions}
          onRetryMissed={handleRetryMissed}
          onRestart={handleRestart}
          onBackToNote={onClose}
        />
      );
    }
    if (!currentQuestion) {
      return null;
    }
    const outcomeFor = (index: number): AnswerOutcome | undefined => {
      if (!checked) {
        return undefined;
      }
      if (index === currentQuestion.correctIndex) {
        return 'correct';
      }
      return selectedOption === index ? 'incorrect' : undefined;
    };
    const feedback = checked
      ? OUTCOME_FEEDBACK[
          selectedOption === currentQuestion.correctIndex
            ? 'correct'
            : 'incorrect'
        ]
      : null;

    return (
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <p className="text-sm text-(--muted-foreground)">
          {t('ai.artifacts.focus.questionOf', {
            current: quiz.position + 1,
            total: quiz.total,
          })}
        </p>
        <div className="rounded-lg border border-(--border) bg-(--card) p-4 shadow-sm lg:p-6">
          <p className="text-xl font-semibold leading-relaxed lg:text-2xl">
            {currentQuestion.question}
          </p>
        </div>
        <div
          role="radiogroup"
          aria-label={currentQuestion.question}
          className="space-y-3"
        >
          {currentQuestion.options.map((option, index) => (
            <AnswerOption
              key={index}
              ref={(node) => {
                optionRefs.current[index] = node;
              }}
              index={index}
              selected={selectedOption === index}
              outcome={outcomeFor(index)}
              disabled={checked}
              tabIndex={index === focusedIndex ? 0 : -1}
              className="min-h-12 text-lg leading-relaxed"
              onFocus={() => setFocusedIndex(index)}
              onKeyDown={handleArrowKey}
              onSelect={() => {
                setFocusedIndex(index);
                select(index);
              }}
            >
              <span className="flex items-start gap-3">
                {!checked && (
                  <Kbd
                    aria-hidden="true"
                    className="mt-1 hidden shrink-0 md:inline-flex"
                  >
                    {index + 1}
                  </Kbd>
                )}
                <span className="min-w-0 break-words">{option}</span>
              </span>
              {!checked && selectedOption === index && (
                <span
                  aria-hidden="true"
                  className="block text-sm text-(--muted-foreground)"
                >
                  {t('ai.artifacts.quiz.selected')}
                </span>
              )}
            </AnswerOption>
          ))}
        </div>
        <div role="status">
          {feedback && (
            <p
              className={`text-lg font-medium leading-relaxed ${feedback.className}`}
            >
              {t(feedback.key, {
                letter: answerLetter(currentQuestion.correctIndex),
                answer: currentQuestion.options[currentQuestion.correctIndex],
              })}
            </p>
          )}
        </div>
        {checked && currentQuestion.explanation && (
          <div className="rounded-lg border border-(--border) bg-(--muted)/50 p-4">
            <p className="text-base font-medium">
              {t('ai.artifacts.quiz.explanation')}
            </p>
            <p className="mt-2 text-base leading-relaxed text-(--muted-foreground)">
              {currentQuestion.explanation}
            </p>
          </div>
        )}
      </div>
    );
  };

  return (
    <StudyFocusDialog
      tool={STUDY_TOOL.QUIZ}
      title={artifact.title}
      progress={{
        segments,
        label: t('ai.artifacts.focus.trackLabel', {
          done: quiz.answers.length,
          count: quiz.total,
        }),
      }}
      inProgress={quiz.answers.length > 0 && !completed}
      onClose={onClose}
      actions={
        !completed && currentQuestion ? (
          <div className="flex justify-end">
            {checked ? (
              <Button
                size="lg"
                className="min-h-12 w-full sm:w-auto"
                ref={advanceRef}
                onClick={handleNext}
              >
                {t(
                  quiz.isLast
                    ? 'ai.artifacts.quiz.finish'
                    : 'ai.artifacts.quiz.next'
                )}
              </Button>
            ) : (
              <Button
                size="lg"
                className="min-h-12 w-full sm:w-auto"
                disabled={selectedOption === null}
                onClick={check}
              >
                {t('ai.artifacts.quiz.checkAnswer')}
              </Button>
            )}
          </div>
        ) : undefined
      }
      hints={<StudyKeyHints hints={hints} />}
    >
      {renderStage()}
    </StudyFocusDialog>
  );
}
