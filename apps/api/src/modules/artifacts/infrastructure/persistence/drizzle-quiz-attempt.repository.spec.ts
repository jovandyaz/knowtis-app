import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { QUIZ_ATTEMPT_SCOPE } from '@knowtis/shared-types';

import type { Database } from '../../../../database';
import { failedQuery } from '../../../../test-support/database-errors';
import { ArtifactErrorCodes } from '../../domain/errors/artifact.errors';
import { DrizzleQuizAttemptRepository } from './drizzle-quiz-attempt.repository';

const SECRET_ANSWER = 'sentinel-quiz-answer';

describe('DrizzleQuizAttemptRepository when the database rejects an attempt', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs the attempt by its diagnostics and answers with the fixed internal error', async () => {
    const repo = new DrizzleQuizAttemptRepository({
      insert: () => ({
        values: () => ({
          returning: () => Promise.reject(failedQuery([SECRET_ANSWER])),
        }),
      }),
    } as unknown as Database);
    const log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    const rejected = await repo.create({
      artifactId: 'artifact-1',
      userId: 'user-1',
      score: 0.5,
      scope: QUIZ_ATTEMPT_SCOPE.FULL,
      answers: [],
    });

    expect(rejected._unsafeUnwrapErr()).toEqual({
      code: ArtifactErrorCodes.INTERNAL_ERROR,
      message: 'Internal error: Failed to create quiz attempt',
    });
    expect(log.mock.calls).toEqual([
      [
        {
          event: 'quiz_attempt.create_error',
          artifactId: 'artifact-1',
          userId: 'user-1',
          errorName: 'DrizzleQueryError',
          failureCategory: 'unclassified',
          sqlState: '40P01',
        },
      ],
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET_ANSWER);
  });
});
