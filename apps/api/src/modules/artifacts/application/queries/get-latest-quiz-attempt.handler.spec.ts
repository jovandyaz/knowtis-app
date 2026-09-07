import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ArtifactErrorCodes } from '../../domain/errors/artifact.errors';
import type {
  ArtifactEntity,
  ArtifactReadRepository,
  QuizAttemptRepository,
} from '../../domain/ports/artifact.repository';
import { GetLatestQuizAttemptHandler } from './get-latest-quiz-attempt.handler';

const quiz: ArtifactEntity = {
  id: 'quiz-1',
  type: 'quiz',
  userId: 'user-1',
  sourceNoteId: 'note-1',
  title: 'Quiz: Test',
  content: {
    questions: [
      {
        question: 'Q0',
        options: ['a', 'b'],
        correctIndex: 0,
        explanation: 'e0',
      },
      {
        question: 'Q1',
        options: ['a', 'b'],
        correctIndex: 1,
        explanation: 'e1',
      },
    ],
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('GetLatestQuizAttemptHandler', () => {
  let findLatestFull: ReturnType<typeof vi.fn>;
  let handler: GetLatestQuizAttemptHandler;

  beforeEach(() => {
    findLatestFull = vi.fn().mockResolvedValue({
      id: 'a1',
      artifactId: 'quiz-1',
      score: 0.5,
      scope: 'full',
      answers: [
        { questionIndex: 0, selectedIndex: 0, correct: true },
        { questionIndex: 1, selectedIndex: 0, correct: false },
      ],
      completedAt: '2026-09-06T10:00:00.000Z',
    });
    handler = new GetLatestQuizAttemptHandler(
      {
        findById: vi.fn().mockResolvedValue(quiz),
      } as unknown as ArtifactReadRepository,
      { findLatestFull } as unknown as QuizAttemptRepository
    );
  });

  it('expands the latest full attempt into a per-question review', async () => {
    const result = await handler.execute({
      artifactId: 'quiz-1',
      userId: 'user-1',
    });

    expect(result._unsafeUnwrap()).toEqual({
      latest: {
        score: 0.5,
        completedAt: '2026-09-06T10:00:00.000Z',
        review: [
          {
            questionIndex: 0,
            question: 'Q0',
            options: ['a', 'b'],
            selectedIndex: 0,
            correctIndex: 0,
            explanation: 'e0',
          },
          {
            questionIndex: 1,
            question: 'Q1',
            options: ['a', 'b'],
            selectedIndex: 0,
            correctIndex: 1,
            explanation: 'e1',
          },
        ],
        missedQuestionIndexes: [1],
      },
    });
  });

  it('deduplicates a legacy attempt that answered the same question twice', async () => {
    findLatestFull.mockResolvedValue({
      id: 'a1',
      artifactId: 'quiz-1',
      score: 1 / 3,
      scope: 'full',
      answers: [
        { questionIndex: 1, selectedIndex: 0, correct: false },
        { questionIndex: 1, selectedIndex: 0, correct: false },
        { questionIndex: 0, selectedIndex: 0, correct: true },
      ],
      completedAt: '2026-09-06T10:00:00.000Z',
    });

    const result = await handler.execute({
      artifactId: 'quiz-1',
      userId: 'user-1',
    });

    expect(result._unsafeUnwrap().latest?.missedQuestionIndexes).toEqual([1]);
  });

  it('returns latest null when there is no full attempt', async () => {
    findLatestFull.mockResolvedValue(null);
    const result = await handler.execute({
      artifactId: 'quiz-1',
      userId: 'user-1',
    });
    expect(result._unsafeUnwrap()).toEqual({ latest: null });
  });

  it('rejects an artifact that is not a quiz', async () => {
    const deckHandler = new GetLatestQuizAttemptHandler(
      {
        findById: vi
          .fn()
          .mockResolvedValue({ ...quiz, type: 'flashcard_deck' }),
      } as unknown as ArtifactReadRepository,
      { findLatestFull } as unknown as QuizAttemptRepository
    );
    const result = await deckHandler.execute({
      artifactId: 'quiz-1',
      userId: 'user-1',
    });
    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_ARTIFACT_TYPE
    );
  });
});
