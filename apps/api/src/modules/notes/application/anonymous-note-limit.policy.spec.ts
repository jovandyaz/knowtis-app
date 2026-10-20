import { UserId } from '@jovandyaz/auth/server';
import { describe, expect, it, vi } from 'vitest';

import { ANONYMOUS_LIMITS } from '@knowtis/shared-types';

import type { UsersService } from '../../users/users.service';
import { NoteErrorCodes } from '../domain/errors/note.errors';
import type { NoteReadRepository } from '../domain/ports/note-read.repository';
import { AnonymousNoteLimitPolicy } from './anonymous-note-limit.policy';

const OWNER = UserId.fromTrusted('5d0c2a9e-41b7-4f3e-9a6d-2c8e1f7b3a40');

function policyFor(
  owner: { isAnonymous: boolean } | null,
  owned: number
): {
  policy: AnonymousNoteLimitPolicy;
  countAccessibleByUser: ReturnType<typeof vi.fn>;
} {
  const users = {
    findById: vi.fn().mockResolvedValue(owner),
  } as unknown as UsersService;
  const countAccessibleByUser = vi
    .fn()
    .mockResolvedValue({ total: owned + 3, owned });
  const notes = { countAccessibleByUser } as unknown as NoteReadRepository;
  return {
    policy: new AnonymousNoteLimitPolicy(users, notes),
    countAccessibleByUser,
  };
}

describe('AnonymousNoteLimitPolicy', () => {
  it('admits an anonymous owner below the limit', async () => {
    const { policy } = policyFor(
      { isAnonymous: true },
      ANONYMOUS_LIMITS.maxNotes - 1
    );

    expect((await policy.admit(OWNER)).isOk()).toBe(true);
  });

  it('refuses an anonymous owner who already holds the limit, counting only the notes they own', async () => {
    const { policy, countAccessibleByUser } = policyFor(
      { isAnonymous: true },
      ANONYMOUS_LIMITS.maxNotes
    );

    const result = await policy.admit(OWNER);

    expect(result._unsafeUnwrapErr()).toMatchObject({
      code: NoteErrorCodes.ANONYMOUS_NOTE_LIMIT,
      message: expect.stringContaining(String(ANONYMOUS_LIMITS.maxNotes)),
    });
    expect(countAccessibleByUser).toHaveBeenCalledWith(OWNER);
  });

  it('admits a registered owner past the anonymous limit without counting', async () => {
    const { policy, countAccessibleByUser } = policyFor(
      { isAnonymous: false },
      ANONYMOUS_LIMITS.maxNotes + 10
    );

    expect((await policy.admit(OWNER)).isOk()).toBe(true);
    expect(countAccessibleByUser).not.toHaveBeenCalled();
  });

  it('leaves an unknown owner to the write that follows', async () => {
    const { policy, countAccessibleByUser } = policyFor(null, 0);

    expect((await policy.admit(OWNER)).isOk()).toBe(true);
    expect(countAccessibleByUser).not.toHaveBeenCalled();
  });
});
