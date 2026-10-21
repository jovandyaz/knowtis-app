import { UserId } from '@jovandyaz/auth/server';
import { describe, expect, it, vi } from 'vitest';

import { ANONYMOUS_LIMITS } from '@knowtis/shared-types';

import type { UsersService } from '../../users/users.service';
import { AnonymousNoteLimitPolicy } from './anonymous-note-limit.policy';

const OWNER = UserId.fromTrusted('5d0c2a9e-41b7-4f3e-9a6d-2c8e1f7b3a40');

function policyFor(owner: { isAnonymous: boolean } | null): {
  policy: AnonymousNoteLimitPolicy;
  findById: ReturnType<typeof vi.fn>;
} {
  const findById = vi.fn().mockResolvedValue(owner);
  return {
    policy: new AnonymousNoteLimitPolicy({
      findById,
    } as unknown as UsersService),
    findById,
  };
}

describe('AnonymousNoteLimitPolicy', () => {
  it('caps an anonymous owner at the anonymous note limit, read from their account', async () => {
    const { policy, findById } = policyFor({ isAnonymous: true });

    expect(await policy.admissionFor(OWNER)).toEqual({
      anonymousNoteCap: ANONYMOUS_LIMITS.maxNotes,
    });
    expect(findById).toHaveBeenCalledWith(OWNER.value);
  });

  it('leaves a registered owner uncapped', async () => {
    const { policy } = policyFor({ isAnonymous: false });

    expect(await policy.admissionFor(OWNER)).toEqual({});
  });

  it('leaves an unknown owner to the write that follows', async () => {
    const { policy } = policyFor(null);

    expect(await policy.admissionFor(OWNER)).toEqual({});
  });
});
