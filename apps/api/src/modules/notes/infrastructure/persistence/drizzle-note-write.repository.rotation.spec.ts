import { Logger } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../../database';
import { DrizzleNoteWriteRepository } from './drizzle-note-write.repository';

const NOTE_ID = '7f63cd6e-dd40-4839-8809-3dd9e3451da8';
const PRIVATE_CANARY = 'private-token-content-email-canary';

describe('Rotation failure diagnostics', () => {
  afterEach(() => vi.restoreAllMocks());

  it.each([
    ['23505', 'unique_violation', '23505'],
    ['08006', 'connection_failure', '08006'],
    ['ECONNREFUSED', 'connection_failure', null],
    ['55P03', 'transaction_conflict', '55P03'],
    [PRIVATE_CANARY, 'unclassified', null],
  ])(
    'records safe context for wrapped driver code %s without serializing the error',
    async (code, category, sqlState) => {
      const cause = Object.assign(new Error(PRIVATE_CANARY), {
        code,
        detail: PRIVATE_CANARY,
        constraint_name: PRIVATE_CANARY,
      });
      const error = new DrizzleQueryError(
        `update notes ${PRIVATE_CANARY}`,
        [PRIVATE_CANARY],
        cause
      );
      const db = {
        update: () => {
          throw error;
        },
      } as unknown as Database;
      const repository = new DrizzleNoteWriteRepository(db);
      const log = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const result = await repository.rotateShareToken({
        noteId: NOTE_ID,
        ownerId: 'owner',
        expectedToken: PRIVATE_CANARY,
        newToken: PRIVATE_CANARY,
      });

      expect(result._unsafeUnwrapErr().code).toBe('INTERNAL_ERROR');
      expect(log.mock.calls).toEqual([
        [
          {
            operation: 'rotateShareToken',
            noteId: NOTE_ID,
            failureCategory: category,
            sqlState,
            errorName: 'DrizzleQueryError',
          },
        ],
      ]);
      expect(JSON.stringify(log.mock.calls)).not.toContain(PRIVATE_CANARY);
    }
  );
});
