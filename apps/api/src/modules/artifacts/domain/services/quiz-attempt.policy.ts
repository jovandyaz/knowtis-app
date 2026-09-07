import { err, ok, type Result } from 'neverthrow';

import {
  QUIZ_ATTEMPT_SCOPE,
  type QuizAttempt,
  type QuizAttemptScope,
  type QuizContent,
} from '@knowtis/shared-types';

import {
  ArtifactErrors,
  type ArtifactDomainError,
} from '../errors/artifact.errors';
import { missedQuestionIndexes } from './missed-question-indexes';

export interface QuizAnswer {
  questionIndex: number;
  selectedIndex: number;
}

export interface GradedQuizAttempt {
  gradedAnswers: QuizAttempt['answers'];
  score: number;
}

type QuizQuestions = QuizContent['questions'];

function sameIndexSet(a: readonly number[], b: readonly number[]): boolean {
  const left = new Set(a);
  const right = new Set(b);
  return (
    left.size === right.size && [...left].every((index) => right.has(index))
  );
}

/**
 * Rejects unknown or repeated questions and options the question does not offer.
 * A full attempt must also answer every question: an incomplete one would score
 * against the whole quiz yet leave the blanks out of the remediable missed set.
 */
export function validateQuizAnswers(
  questions: QuizQuestions,
  answers: readonly QuizAnswer[],
  scope: QuizAttemptScope
): Result<void, ArtifactDomainError> {
  const answered = new Set<number>();

  for (const answer of answers) {
    const question = questions[answer.questionIndex];
    if (!question) {
      return err(
        ArtifactErrors.invalidQuizAnswer(
          `question ${answer.questionIndex} is not part of this quiz`
        )
      );
    }
    if (answered.has(answer.questionIndex)) {
      return err(
        ArtifactErrors.invalidQuizAnswer(
          `question ${answer.questionIndex} is answered more than once`
        )
      );
    }
    answered.add(answer.questionIndex);
    if (answer.selectedIndex >= question.options.length) {
      return err(
        ArtifactErrors.invalidQuizAnswer(
          `option ${answer.selectedIndex} is not offered for question ${answer.questionIndex}`
        )
      );
    }
  }

  if (scope === QUIZ_ATTEMPT_SCOPE.FULL && answered.size !== questions.length) {
    return err(
      ArtifactErrors.invalidQuizAnswer(
        'a full attempt must answer every question'
      )
    );
  }

  return ok(undefined);
}

/**
 * Returns the questions a missed-scope attempt remediates — exactly the set the
 * latest full attempt got wrong, no more and no fewer.
 */
export function resolveMissedScope(
  latestFull: QuizAttempt | null,
  answers: readonly QuizAnswer[]
): Result<number[], ArtifactDomainError> {
  if (!latestFull) {
    return err(ArtifactErrors.invalidQuizScope('no full attempt to remediate'));
  }

  const missed = missedQuestionIndexes(latestFull.answers);
  if (missed.length === 0) {
    return err(ArtifactErrors.invalidQuizScope('nothing to remediate'));
  }

  const answered = answers.map((answer) => answer.questionIndex);
  if (!sameIndexSet(answered, missed)) {
    return err(
      ArtifactErrors.invalidQuizScope(
        'answers must cover exactly the missed questions of the latest full attempt'
      )
    );
  }

  return ok(missed);
}

/**
 * Grades already-validated answers. A full attempt scores over the whole quiz;
 * a missed attempt scores only over the questions it remediates.
 */
export function gradeQuizAttempt(
  questions: QuizQuestions,
  answers: readonly QuizAnswer[],
  scope: QuizAttemptScope
): GradedQuizAttempt {
  const gradedAnswers = answers.map((answer) => {
    const question = questions[answer.questionIndex];
    return {
      questionIndex: answer.questionIndex,
      selectedIndex: answer.selectedIndex,
      correct: question
        ? answer.selectedIndex === question.correctIndex
        : false,
    };
  });

  const correctCount = gradedAnswers.filter((answer) => answer.correct).length;
  const denominator =
    scope === QUIZ_ATTEMPT_SCOPE.FULL ? questions.length : gradedAnswers.length;

  return {
    gradedAnswers,
    score: denominator > 0 ? correctCount / denominator : 0,
  };
}
