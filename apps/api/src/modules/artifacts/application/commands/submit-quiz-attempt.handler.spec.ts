import type { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { QuizAttempt } from '@knowtis/shared-types';

import { ArtifactErrorCodes } from '../../domain/errors/artifact.errors';
import { QuizCompletedEvent } from '../../domain/events/quiz-completed.event';
import type {
  ArtifactEntity,
  ArtifactReadRepository,
  QuizAttemptRepository,
} from '../../domain/ports/artifact.repository';
import { SubmitQuizAttemptHandler } from './submit-quiz-attempt.handler';

const USER_ID = 'user-1';
const ARTIFACT_ID = 'quiz-1';

const quiz: ArtifactEntity = {
  id: ARTIFACT_ID,
  type: 'quiz',
  userId: USER_ID,
  sourceNoteId: 'note-1',
  title: 'Quiz: Test',
  content: {
    questions: [
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
    ],
  },
  createdAt: new Date(),
  updatedAt: new Date(),
};

const fullAttempt: QuizAttempt = {
  id: 'attempt-1',
  artifactId: ARTIFACT_ID,
  score: 1 / 3,
  scope: 'full',
  answers: [
    { questionIndex: 0, selectedIndex: 0, correct: true },
    { questionIndex: 1, selectedIndex: 0, correct: false },
    { questionIndex: 2, selectedIndex: 0, correct: false },
  ],
  completedAt: new Date().toISOString(),
};

describe('SubmitQuizAttemptHandler', () => {
  let create: ReturnType<typeof vi.fn>;
  let findLatestFull: ReturnType<typeof vi.fn>;
  let emit: ReturnType<typeof vi.fn>;
  let handler: SubmitQuizAttemptHandler;

  beforeEach(() => {
    create = vi
      .fn()
      .mockImplementation(async (data) =>
        ok({ id: 'new', completedAt: new Date().toISOString(), ...data })
      );
    findLatestFull = vi.fn().mockResolvedValue(fullAttempt);
    emit = vi.fn();
    handler = new SubmitQuizAttemptHandler(
      {
        findById: vi.fn().mockResolvedValue(quiz),
      } as unknown as ArtifactReadRepository,
      { create, findLatestFull } as unknown as QuizAttemptRepository,
      { emit } as unknown as EventEmitter2
    );
  });

  it('persists the graded full attempt and emits quiz completed after it', async () => {
    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      answers: [
        { questionIndex: 0, selectedIndex: 0 },
        { questionIndex: 1, selectedIndex: 1 },
        { questionIndex: 2, selectedIndex: 0 },
      ],
    });

    expect(result.isOk()).toBe(true);
    expect(create).toHaveBeenCalledWith({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      scope: 'full',
      score: 2 / 3,
      answers: [
        { questionIndex: 0, selectedIndex: 0, correct: true },
        { questionIndex: 1, selectedIndex: 1, correct: true },
        { questionIndex: 2, selectedIndex: 0, correct: false },
      ],
    });
    const [name, event] = emit.mock.calls[0] as [string, QuizCompletedEvent];
    expect(name).toBe(QuizCompletedEvent.EVENT_NAME);
    expect(event.scope).toBe('full');
    expect(event.score).toBeCloseTo(2 / 3);
    expect(create.mock.invocationCallOrder[0]).toBeLessThan(
      emit.mock.invocationCallOrder[0] as number
    );
  });

  it('resolves the missed scope against the latest full attempt before persisting', async () => {
    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      scope: 'missed',
      answers: [
        { questionIndex: 1, selectedIndex: 1 },
        { questionIndex: 2, selectedIndex: 0 },
      ],
    });

    expect(result.isOk()).toBe(true);
    expect(findLatestFull).toHaveBeenCalledWith(ARTIFACT_ID, USER_ID);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'missed', score: 0.5 })
    );
  });

  it('returns the answer policy error without reading or writing attempts', async () => {
    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      scope: 'missed',
      answers: [{ questionIndex: 5, selectedIndex: 0 }],
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_QUIZ_ANSWER
    );
    expect(findLatestFull).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('returns the scope policy error without writing or emitting', async () => {
    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      scope: 'missed',
      answers: [{ questionIndex: 1, selectedIndex: 1 }],
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_QUIZ_SCOPE
    );
    expect(create).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects an artifact that is not a quiz without writing or emitting', async () => {
    const deckHandler = new SubmitQuizAttemptHandler(
      {
        findById: vi
          .fn()
          .mockResolvedValue({ ...quiz, type: 'flashcard_deck' }),
      } as unknown as ArtifactReadRepository,
      { create, findLatestFull } as unknown as QuizAttemptRepository,
      { emit } as unknown as EventEmitter2
    );

    const result = await deckHandler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      answers: [{ questionIndex: 0, selectedIndex: 0 }],
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_ARTIFACT_TYPE
    );
    expect(create).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not emit when the attempt cannot be persisted', async () => {
    create.mockResolvedValue(
      err({ code: ArtifactErrorCodes.INTERNAL_ERROR, message: 'db down' })
    );

    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      answers: [
        { questionIndex: 0, selectedIndex: 0 },
        { questionIndex: 1, selectedIndex: 1 },
        { questionIndex: 2, selectedIndex: 2 },
      ],
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INTERNAL_ERROR
    );
    expect(emit).not.toHaveBeenCalled();
  });
});
