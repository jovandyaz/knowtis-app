import type { EventEmitter2 } from '@nestjs/event-emitter';
import { ok } from 'neverthrow';
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

  it('grades a full attempt over every question and emits quiz completed', async () => {
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
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'full', score: 2 / 3 })
    );
    const [name, event] = emit.mock.calls[0] as [string, QuizCompletedEvent];
    expect(name).toBe(QuizCompletedEvent.EVENT_NAME);
    expect(event.scope).toBe('full');
    expect(event.score).toBeCloseTo(2 / 3);
  });

  it('grades a missed attempt over exactly the missed questions of the latest full attempt', async () => {
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
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'missed', score: 0.5 })
    );
  });

  it('accepts a missed attempt matching a legacy full attempt that duplicated a question index', async () => {
    findLatestFull.mockResolvedValue({
      ...fullAttempt,
      answers: [
        { questionIndex: 1, selectedIndex: 0, correct: false },
        { questionIndex: 1, selectedIndex: 0, correct: false },
        { questionIndex: 0, selectedIndex: 0, correct: true },
      ],
    });

    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      scope: 'missed',
      answers: [{ questionIndex: 1, selectedIndex: 1 }],
    });

    expect(result.isOk()).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ scope: 'missed', score: 1 })
    );
  });

  it('rejects a missed attempt whose questions differ from the missed set', async () => {
    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      scope: 'missed',
      answers: [{ questionIndex: 1, selectedIndex: 1 }],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_QUIZ_SCOPE
    );
    expect(create).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects a missed attempt when there is no full attempt to remediate', async () => {
    findLatestFull.mockResolvedValue(null);

    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      scope: 'missed',
      answers: [{ questionIndex: 1, selectedIndex: 1 }],
    });

    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_QUIZ_SCOPE
    );
  });

  it('rejects a missed attempt that duplicates a question instead of covering the missed set once each', async () => {
    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      scope: 'missed',
      answers: [
        { questionIndex: 1, selectedIndex: 1 },
        { questionIndex: 1, selectedIndex: 1 },
        { questionIndex: 2, selectedIndex: 0 },
      ],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_QUIZ_ANSWER
    );
    expect(create).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects a missed attempt carrying a question index beyond the quiz', async () => {
    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      scope: 'missed',
      answers: [
        { questionIndex: 1, selectedIndex: 1 },
        { questionIndex: 5, selectedIndex: 0 },
      ],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_QUIZ_ANSWER
    );
    expect(findLatestFull).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects a full attempt that answers the same question twice', async () => {
    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      answers: [
        { questionIndex: 0, selectedIndex: 0 },
        { questionIndex: 0, selectedIndex: 0 },
      ],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_QUIZ_ANSWER
    );
    expect(create).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects a question index beyond the quiz', async () => {
    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      answers: [
        { questionIndex: 0, selectedIndex: 0 },
        { questionIndex: 3, selectedIndex: 0 },
      ],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_QUIZ_ANSWER
    );
    expect(create).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects a selected option the question does not offer', async () => {
    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      answers: [{ questionIndex: 0, selectedIndex: 3 }],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_QUIZ_ANSWER
    );
    expect(create).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects a missed attempt when the latest full attempt has nothing to remediate', async () => {
    findLatestFull.mockResolvedValue({
      ...fullAttempt,
      answers: fullAttempt.answers.map((answer) => ({
        ...answer,
        correct: true,
      })),
    });

    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      scope: 'missed',
      answers: [],
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_QUIZ_SCOPE
    );
    expect(create).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
