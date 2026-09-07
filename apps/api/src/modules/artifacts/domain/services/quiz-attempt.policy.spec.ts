import { describe, expect, it } from 'vitest';

import { QUIZ_ATTEMPT_SCOPE, type QuizAttempt } from '@knowtis/shared-types';

import { ArtifactErrorCodes } from '../errors/artifact.errors';
import {
  gradeQuizAttempt,
  resolveMissedScope,
  validateQuizAnswers,
} from './quiz-attempt.policy';

const questions = [
  {
    question: 'Q0',
    options: ['a', 'b', 'c'],
    correctIndex: 0,
    explanation: 'e0',
  },
  {
    question: 'Q1',
    options: ['a', 'b', 'c'],
    correctIndex: 1,
    explanation: 'e1',
  },
  {
    question: 'Q2',
    options: ['a', 'b', 'c'],
    correctIndex: 2,
    explanation: 'e2',
  },
];

const fullAttempt: QuizAttempt = {
  id: 'attempt-1',
  artifactId: 'quiz-1',
  score: 1 / 3,
  scope: QUIZ_ATTEMPT_SCOPE.FULL,
  answers: [
    { questionIndex: 0, selectedIndex: 0, correct: true },
    { questionIndex: 1, selectedIndex: 0, correct: false },
    { questionIndex: 2, selectedIndex: 0, correct: false },
  ],
  completedAt: '2026-09-06T10:00:00.000Z',
};

describe('validateQuizAnswers', () => {
  it('accepts a full attempt that answers every question exactly once', () => {
    const result = validateQuizAnswers(
      questions,
      [
        { questionIndex: 0, selectedIndex: 0 },
        { questionIndex: 1, selectedIndex: 1 },
        { questionIndex: 2, selectedIndex: 0 },
      ],
      QUIZ_ATTEMPT_SCOPE.FULL
    );

    expect(result.isOk()).toBe(true);
  });

  it('rejects a full attempt that leaves a question unanswered', () => {
    const result = validateQuizAnswers(
      questions,
      [{ questionIndex: 0, selectedIndex: 0 }],
      QUIZ_ATTEMPT_SCOPE.FULL
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      code: ArtifactErrorCodes.INVALID_QUIZ_ANSWER,
      message: 'Invalid quiz answer: a full attempt must answer every question',
    });
  });

  it('rejects a full attempt that answers the same question twice', () => {
    const result = validateQuizAnswers(
      questions,
      [
        { questionIndex: 0, selectedIndex: 0 },
        { questionIndex: 0, selectedIndex: 1 },
      ],
      QUIZ_ATTEMPT_SCOPE.FULL
    );

    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_QUIZ_ANSWER
    );
  });

  it('rejects a question index beyond the quiz', () => {
    const result = validateQuizAnswers(
      questions,
      [{ questionIndex: 3, selectedIndex: 0 }],
      QUIZ_ATTEMPT_SCOPE.FULL
    );

    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_QUIZ_ANSWER
    );
  });

  it('rejects a selected option the question does not offer', () => {
    const result = validateQuizAnswers(
      questions,
      [{ questionIndex: 0, selectedIndex: 3 }],
      QUIZ_ATTEMPT_SCOPE.FULL
    );

    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_QUIZ_ANSWER
    );
  });

  it('accepts a missed attempt that covers only part of the quiz', () => {
    const result = validateQuizAnswers(
      questions,
      [{ questionIndex: 1, selectedIndex: 1 }],
      QUIZ_ATTEMPT_SCOPE.MISSED
    );

    expect(result.isOk()).toBe(true);
  });

  it('rejects a missed attempt that duplicates a question', () => {
    const result = validateQuizAnswers(
      questions,
      [
        { questionIndex: 1, selectedIndex: 1 },
        { questionIndex: 1, selectedIndex: 2 },
      ],
      QUIZ_ATTEMPT_SCOPE.MISSED
    );

    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_QUIZ_ANSWER
    );
  });

  it('accepts an empty missed attempt so the scope rule can reject it', () => {
    const result = validateQuizAnswers(
      questions,
      [],
      QUIZ_ATTEMPT_SCOPE.MISSED
    );

    expect(result.isOk()).toBe(true);
  });
});

describe('resolveMissedScope', () => {
  it('returns the missed indexes when the answers cover exactly that set', () => {
    const result = resolveMissedScope(fullAttempt, [
      { questionIndex: 1, selectedIndex: 1 },
      { questionIndex: 2, selectedIndex: 0 },
    ]);

    expect(result._unsafeUnwrap()).toEqual([1, 2]);
  });

  it('deduplicates a legacy full attempt that answered the same question twice', () => {
    const result = resolveMissedScope(
      {
        ...fullAttempt,
        answers: [
          { questionIndex: 1, selectedIndex: 0, correct: false },
          { questionIndex: 1, selectedIndex: 0, correct: false },
          { questionIndex: 0, selectedIndex: 0, correct: true },
        ],
      },
      [{ questionIndex: 1, selectedIndex: 1 }]
    );

    expect(result._unsafeUnwrap()).toEqual([1]);
  });

  it('rejects when there is no full attempt to remediate', () => {
    const result = resolveMissedScope(null, [
      { questionIndex: 1, selectedIndex: 1 },
    ]);

    expect(result._unsafeUnwrapErr()).toEqual({
      code: ArtifactErrorCodes.INVALID_QUIZ_SCOPE,
      message: 'Invalid quiz attempt scope: no full attempt to remediate',
    });
  });

  it('rejects when the latest full attempt missed nothing', () => {
    const result = resolveMissedScope(
      {
        ...fullAttempt,
        answers: fullAttempt.answers.map((answer) => ({
          ...answer,
          correct: true,
        })),
      },
      []
    );

    expect(result._unsafeUnwrapErr()).toEqual({
      code: ArtifactErrorCodes.INVALID_QUIZ_SCOPE,
      message: 'Invalid quiz attempt scope: nothing to remediate',
    });
  });

  it('rejects answers that differ from the missed set', () => {
    const result = resolveMissedScope(fullAttempt, [
      { questionIndex: 1, selectedIndex: 1 },
    ]);

    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_QUIZ_SCOPE
    );
  });
});

describe('gradeQuizAttempt', () => {
  it('scores a full attempt over every question of the quiz', () => {
    const result = gradeQuizAttempt(
      questions,
      [
        { questionIndex: 0, selectedIndex: 0 },
        { questionIndex: 1, selectedIndex: 1 },
        { questionIndex: 2, selectedIndex: 0 },
      ],
      QUIZ_ATTEMPT_SCOPE.FULL
    );

    expect(result).toEqual({
      score: 2 / 3,
      gradedAnswers: [
        { questionIndex: 0, selectedIndex: 0, correct: true },
        { questionIndex: 1, selectedIndex: 1, correct: true },
        { questionIndex: 2, selectedIndex: 0, correct: false },
      ],
    });
  });

  it('scores a missed attempt over the questions it remediates only', () => {
    const result = gradeQuizAttempt(
      questions,
      [
        { questionIndex: 1, selectedIndex: 1 },
        { questionIndex: 2, selectedIndex: 0 },
      ],
      QUIZ_ATTEMPT_SCOPE.MISSED
    );

    expect(result.score).toBe(0.5);
  });

  it('scores zero when there is nothing to grade', () => {
    const result = gradeQuizAttempt([], [], QUIZ_ATTEMPT_SCOPE.FULL);

    expect(result).toEqual({ score: 0, gradedAnswers: [] });
  });
});
