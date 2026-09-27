import { UserId } from '@jovandyaz/auth/server';
import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../../database';
import { failedQuery } from '../../../../test-support/database-errors';
import { NoteErrorCodes } from '../../domain/errors/note.errors';
import { DrizzleNoteWriteRepository } from './drizzle-note-write.repository';

const NOTE_ID = '4a7c1f1e-6a0b-4d52-9f5e-2f8e1c3b9d10';
const OWNER_ID = 'owner-1';
const SECRET_CONTENT = 'sentinel-private-note-content';
const DIAGNOSTICS_HEADER =
  'DrizzleQueryError (failureCategory=unclassified, sqlState=40P01)';

function rejectingDatabase(): Database {
  const rejection = () => Promise.reject(failedQuery([SECRET_CONTENT]));
  const query = {
    values: () => query,
    set: () => query,
    where: () => query,
    returning: rejection,
  };
  return {
    insert: () => query,
    update: () => query,
    transaction: rejection,
  } as unknown as Database;
}

describe('DrizzleNoteWriteRepository when the database rejects a write', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      'create',
      (repo: DrizzleNoteWriteRepository) =>
        repo.create({
          title: SECRET_CONTENT,
          content: SECRET_CONTENT,
          ownerId: UserId.fromTrusted(OWNER_ID),
        }),
    ],
    [
      'update',
      (repo: DrizzleNoteWriteRepository) =>
        repo.update(NOTE_ID, { content: SECRET_CONTENT }),
    ],
    [
      'updateYjsState',
      (repo: DrizzleNoteWriteRepository) =>
        repo.updateYjsState(NOTE_ID, Buffer.from(SECRET_CONTENT)),
    ],
    [
      'updateContentWithYjsState',
      (repo: DrizzleNoteWriteRepository) =>
        repo.updateContentWithYjsState(
          NOTE_ID,
          { content: SECRET_CONTENT },
          Buffer.from(SECRET_CONTENT)
        ),
    ],
    ['delete', (repo: DrizzleNoteWriteRepository) => repo.delete(NOTE_ID)],
    [
      'restore',
      (repo: DrizzleNoteWriteRepository) => repo.restore(NOTE_ID, OWNER_ID),
    ],
  ])(
    'logs a rejected %s by its diagnostics, never by the note values the query carried',
    async (_operation, write) => {
      const log = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const result = await write(
        new DrizzleNoteWriteRepository(rejectingDatabase())
      );

      expect(result._unsafeUnwrapErr().code).toBe(
        NoteErrorCodes.INTERNAL_ERROR
      );
      expect(log).toHaveBeenCalledTimes(1);
      const [, stack] = log.mock.calls[0];
      expect(String(stack).split('\n')[0]).toBe(DIAGNOSTICS_HEADER);
      expect(JSON.stringify(log.mock.calls)).not.toContain(SECRET_CONTENT);
    }
  );
});
