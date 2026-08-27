import { vi } from 'vitest';

import type { FeatureFlagsService } from '../modules/feature-flags/feature-flags.service';
import type { UsersService } from '../modules/users/users.service';
import { VerifiedIdentityPolicy } from '../modules/users/verified-identity.policy';

export const IDENTITY_STATE = {
  GATE_OFF: 'gate-off',
  UNVERIFIED: 'unverified',
  VERIFIED: 'verified',
} as const;

export type IdentityState =
  (typeof IDENTITY_STATE)[keyof typeof IDENTITY_STATE];

/**
 * A real `VerifiedIdentityPolicy` over stub collaborators, so a spec exercises
 * the gate itself instead of a mocked verdict.
 */
export function policyFor(state: IdentityState): VerifiedIdentityPolicy {
  const featureFlags = {
    isEnabled: vi.fn().mockResolvedValue(state !== IDENTITY_STATE.GATE_OFF),
  };
  const usersService = {
    findById: vi.fn().mockResolvedValue({
      id: 'user-1',
      email: 'ana@test.com',
      isAnonymous: false,
      emailVerifiedAt:
        state === IDENTITY_STATE.VERIFIED
          ? new Date('2026-08-26T10:00:00.000Z')
          : null,
    }),
  };

  return new VerifiedIdentityPolicy(
    usersService as unknown as UsersService,
    featureFlags as unknown as FeatureFlagsService
  );
}
