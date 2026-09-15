import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { ChevronDown } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

import { answerLetter, Button, useMotionPreset } from '@knowtis/design-system';
import type { QuizContent } from '@knowtis/shared-types';

import type { QuizAnswerRecord } from './use-quiz-session';

interface QuizReviewListProps {
  answers: QuizAnswerRecord[];
  questions: QuizContent['questions'];
}

export function QuizReviewList({ answers, questions }: QuizReviewListProps) {
  const { t } = useTranslation('notes');
  const preset = useMotionPreset();
  const id = useId();
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  return (
    <section className="rounded-lg border border-(--border) bg-(--card) p-4 lg:p-6">
      <h3 className="text-base font-semibold lg:text-lg">
        {t('ai.artifacts.quiz.reviewAnswers')}
      </h3>
      <div className="mt-4 space-y-3">
        {answers.map(({ questionIndex, selectedIndex, correct }) => {
          const question = questions[questionIndex];
          const expanded = expandedIndex === questionIndex;
          const rowId = `${id}-question-${questionIndex}`;
          const panelId = `${id}-answer-${questionIndex}`;
          return (
            <div key={questionIndex}>
              <Button
                id={rowId}
                variant="ghost"
                className="h-auto min-h-12 w-full justify-between gap-3 whitespace-normal bg-(--muted) px-3 py-3 text-left"
                aria-expanded={expanded}
                aria-controls={expanded ? panelId : undefined}
                onClick={() =>
                  setExpandedIndex(expanded ? null : questionIndex)
                }
              >
                <span>
                  {t('ai.artifacts.quiz.reviewRow', {
                    n: questionIndex + 1,
                    outcome: t(
                      correct
                        ? 'ai.artifacts.quiz.outcomeRowCorrect'
                        : 'ai.artifacts.quiz.outcomeRowIncorrect'
                    ),
                  })}
                </span>
                <ChevronDown
                  aria-hidden="true"
                  className="size-4 shrink-0 transition-transform duration-(--motion-duration-fast) ease-standard motion-reduce:transition-none"
                  style={{
                    transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                  }}
                />
              </Button>
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    id={panelId}
                    role="region"
                    aria-labelledby={rowId}
                    initial={preset.reduced ? false : { height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={preset.fade}
                    className="overflow-hidden"
                  >
                    <div className="space-y-4 px-3 py-4">
                      <p className="text-base font-medium">
                        {question.question}
                      </p>
                      <dl className="space-y-3 text-base leading-relaxed">
                        <div>
                          <dt className="font-medium">
                            {t('ai.artifacts.quiz.yourAnswer')}
                          </dt>
                          <dd>
                            {answerLetter(selectedIndex)}.{' '}
                            {question.options[selectedIndex]}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium">
                            {t('ai.artifacts.quiz.correctAnswer')}
                          </dt>
                          <dd>
                            {answerLetter(question.correctIndex)}.{' '}
                            {question.options[question.correctIndex]}
                          </dd>
                        </div>
                        {question.explanation && (
                          <div>
                            <dt className="font-medium">
                              {t('ai.artifacts.quiz.explanation')}
                            </dt>
                            <dd className="text-(--muted-foreground)">
                              {question.explanation}
                            </dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
