import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ARTIFACT_TYPE } from '@knowtis/shared-types';

import type { Database } from '../../../../database';
import { failedQuery } from '../../../../test-support/database-errors';
import { ArtifactErrorCodes } from '../../domain/errors/artifact.errors';
import { DrizzleArtifactRepository } from './drizzle-artifact.repository';

const USER_ID = 'user-1';
const ARTIFACT_ID = 'artifact-1';
const SECRET_CONTENT = 'sentinel-artifact-content';
const DIAGNOSTICS = {
  errorName: 'DrizzleQueryError',
  failureCategory: 'unclassified',
  sqlState: '40P01',
};

function rejectingDatabase(): Database {
  const rejection = () => ({
    returning: () => Promise.reject(failedQuery([SECRET_CONTENT])),
  });
  return {
    insert: () => ({ values: rejection }),
    delete: () => ({ where: rejection }),
  } as unknown as Database;
}

describe('DrizzleArtifactRepository when the database rejects a write', () => {
  let repo: DrizzleArtifactRepository;
  let log: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    repo = new DrizzleArtifactRepository(rejectingDatabase());
    log = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('logs a rejected artifact by its diagnostics and answers with the fixed internal error', async () => {
    const rejected = await repo.create({
      type: ARTIFACT_TYPE.FLASHCARD_DECK,
      userId: USER_ID,
      sourceNoteId: 'note-1',
      title: 'Flashcards',
      content: {
        cards: [{ front: SECRET_CONTENT, back: 'A', difficulty: 'easy' }],
      },
    });

    expect(rejected._unsafeUnwrapErr()).toEqual({
      code: ArtifactErrorCodes.INTERNAL_ERROR,
      message: 'Internal error: Failed to create artifact',
    });
    expect(log.mock.calls).toEqual([
      [{ operation: 'createArtifact', userId: USER_ID, ...DIAGNOSTICS }],
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET_CONTENT);
  });

  it('logs a rejected deletion by its diagnostics and answers with the fixed internal error', async () => {
    const rejected = await repo.delete(ARTIFACT_ID, USER_ID);

    expect(rejected._unsafeUnwrapErr()).toEqual({
      code: ArtifactErrorCodes.INTERNAL_ERROR,
      message: 'Internal error: Failed to delete artifact',
    });
    expect(log.mock.calls).toEqual([
      [
        {
          operation: 'deleteArtifact',
          artifactId: ARTIFACT_ID,
          ...DIAGNOSTICS,
        },
      ],
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET_CONTENT);
  });
});
