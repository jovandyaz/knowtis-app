import { vi } from 'vitest';

import type { UsersService } from '../modules/users/users.service';
import { VerifiedIdentityPolicy } from '../modules/users/verified-identity.policy';

export const IDENTITY_STATE = {
  ANONYMOUS: 'anonymous',
  UNVERIFIED: 'unverified',
  VERIFIED: 'verified',
} as const;

export type IdentityState =
  (typeof IDENTITY_STATE)[keyof typeof IDENTITY_STATE];

/**
 * A real `VerifiedIdentityPolicy` over a stub users service, so a spec exercises
 * the gate itself instead of a mocked verdict.
 */
export function policyFor(state: IdentityState): VerifiedIdentityPolicy {
  const usersService = {
    findById: vi.fn().mockResolvedValue({
      id: 'user-1',
      email: 'ana@test.com',
      isAnonymous: state === IDENTITY_STATE.ANONYMOUS,
      emailVerifiedAt:
        state === IDENTITY_STATE.VERIFIED
          ? new Date('2026-08-26T10:00:00.000Z')
          : null,
    }),
  };

  return new VerifiedIdentityPolicy(usersService as unknown as UsersService);
}
