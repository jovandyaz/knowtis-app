import type { AuthUserProfile } from '@jovandyaz/auth-react';
import { describe, expect, it, vi } from 'vitest';

import { syncVerifiedUserFromOtherTab } from '../cross-tab-profile-sync';

const verified = { id: 'u1', emailVerifiedAt: '2026-09-05T10:00:00.000Z' };

function profile(overrides: Partial<AuthUserProfile>): AuthUserProfile {
  return {
    id: 'u1',
    email: 'u1@example.com',
    name: 'U1',
    avatarUrl: null,
    emailVerifiedAt: null,
    ...overrides,
  };
}

describe('syncVerifiedUserFromOtherTab', () => {
  it('invalidates the profile when this tab still sees the same user as unverified', () => {
    const invalidateProfile = vi.fn();

    syncVerifiedUserFromOtherTab(verified, {
      user: profile({ emailVerifiedAt: null }),
      invalidateProfile,
    });

    expect(invalidateProfile).toHaveBeenCalledTimes(1);
  });

  it('does nothing when this tab already sees the user as verified', () => {
    const invalidateProfile = vi.fn();

    syncVerifiedUserFromOtherTab(verified, {
      user: profile({ emailVerifiedAt: verified.emailVerifiedAt }),
      invalidateProfile,
    });

    expect(invalidateProfile).not.toHaveBeenCalled();
  });

  it('does nothing when the broadcast is about a different user', () => {
    const invalidateProfile = vi.fn();

    syncVerifiedUserFromOtherTab(verified, {
      user: profile({ id: 'u2', emailVerifiedAt: null }),
      invalidateProfile,
    });

    expect(invalidateProfile).not.toHaveBeenCalled();
  });

  it('does nothing when this tab has no user', () => {
    const invalidateProfile = vi.fn();

    syncVerifiedUserFromOtherTab(verified, { user: null, invalidateProfile });

    expect(invalidateProfile).not.toHaveBeenCalled();
  });
});
