import { ForbiddenException, HttpStatus } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  EMAIL_NOT_VERIFIED_CODE,
  FEATURE_FLAG_KEYS,
} from '@knowtis/shared-types';

import type { FeatureFlagsService } from '../../feature-flags/feature-flags.service';
import type { UsersService } from '../users.service';
import { VerifiedIdentityPolicy } from '../verified-identity.policy';

type UserRow = Awaited<ReturnType<UsersService['findById']>>;

const VERIFIED_AT = new Date('2026-08-26T10:00:00.000Z');

function userRow(overrides: {
  isAnonymous: boolean;
  emailVerifiedAt: Date | null;
}): UserRow {
  return {
    id: 'user-1',
    email: 'ana@test.com',
    ...overrides,
  } as unknown as UserRow;
}

describe('VerifiedIdentityPolicy', () => {
  let usersService: { findById: ReturnType<typeof vi.fn> };
  let featureFlags: { isEnabled: ReturnType<typeof vi.fn> };
  let policy: VerifiedIdentityPolicy;

  beforeEach(() => {
    usersService = { findById: vi.fn() };
    featureFlags = { isEnabled: vi.fn() };
    policy = new VerifiedIdentityPolicy(
      usersService as unknown as UsersService,
      featureFlags as unknown as FeatureFlagsService
    );
  });

  describe('when the gate flag is off', () => {
    beforeEach(() => {
      featureFlags.isEnabled.mockResolvedValue(false);
    });

    it('allows an unverified user', async () => {
      usersService.findById.mockResolvedValue(
        userRow({ isAnonymous: false, emailVerifiedAt: null })
      );

      await expect(policy.isVerified('user-1')).resolves.toBe(true);
    });

    it('allows without reading the user at all', async () => {
      await expect(policy.isVerified('user-1')).resolves.toBe(true);
      expect(usersService.findById).not.toHaveBeenCalled();
    });
  });

  describe('when the gate flag is on', () => {
    beforeEach(() => {
      featureFlags.isEnabled.mockResolvedValue(true);
    });

    it('checks the gate flag by its key', async () => {
      usersService.findById.mockResolvedValue(
        userRow({ isAnonymous: false, emailVerifiedAt: VERIFIED_AT })
      );

      await policy.isVerified('user-1');

      expect(featureFlags.isEnabled).toHaveBeenCalledWith(
        FEATURE_FLAG_KEYS.EMAIL_VERIFICATION_GATE
      );
    });

    it('denies an anonymous session', async () => {
      usersService.findById.mockResolvedValue(
        userRow({ isAnonymous: true, emailVerifiedAt: null })
      );

      await expect(policy.isVerified('user-1')).resolves.toBe(false);
    });

    it('denies an anonymous session carrying a verification timestamp', async () => {
      usersService.findById.mockResolvedValue(
        userRow({ isAnonymous: true, emailVerifiedAt: VERIFIED_AT })
      );

      await expect(policy.isVerified('user-1')).resolves.toBe(false);
    });

    it('denies a registered user whose email is unverified', async () => {
      usersService.findById.mockResolvedValue(
        userRow({ isAnonymous: false, emailVerifiedAt: null })
      );

      await expect(policy.isVerified('user-1')).resolves.toBe(false);
    });

    it('denies a user id with no row', async () => {
      usersService.findById.mockResolvedValue(null);

      await expect(policy.isVerified('missing')).resolves.toBe(false);
    });

    it('allows a registered user with a verified email', async () => {
      usersService.findById.mockResolvedValue(
        userRow({ isAnonymous: false, emailVerifiedAt: VERIFIED_AT })
      );

      await expect(policy.isVerified('user-1')).resolves.toBe(true);
    });

    it('reflects a verification revoked between two calls', async () => {
      usersService.findById
        .mockResolvedValueOnce(
          userRow({ isAnonymous: false, emailVerifiedAt: VERIFIED_AT })
        )
        .mockResolvedValueOnce(
          userRow({ isAnonymous: false, emailVerifiedAt: null })
        );

      await expect(policy.isVerified('user-1')).resolves.toBe(true);
      await expect(policy.isVerified('user-1')).resolves.toBe(false);
    });
  });

  describe('assertVerified', () => {
    it('resolves for a verified user', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      usersService.findById.mockResolvedValue(
        userRow({ isAnonymous: false, emailVerifiedAt: VERIFIED_AT })
      );

      await expect(
        policy.assertVerified('user-1', 'Verify your email')
      ).resolves.toBeUndefined();
    });

    it('throws a 403 carrying the shared gate code and the caller message', async () => {
      featureFlags.isEnabled.mockResolvedValue(true);
      usersService.findById.mockResolvedValue(
        userRow({ isAnonymous: false, emailVerifiedAt: null })
      );

      const thrown = await policy
        .assertVerified('user-1', 'Verify your email to create API keys')
        .catch((error: unknown) => error);

      expect(thrown).toBeInstanceOf(ForbiddenException);
      expect((thrown as ForbiddenException).getStatus()).toBe(
        HttpStatus.FORBIDDEN
      );
      expect((thrown as ForbiddenException).getResponse()).toEqual({
        code: EMAIL_NOT_VERIFIED_CODE,
        message: 'Verify your email to create API keys',
      });
    });
  });
});
