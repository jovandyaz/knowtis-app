import { describe, expect, it } from 'vitest';

import { resolveAdminAccess } from '../admin-gate';

const adminUser = {
  id: 'u1',
  email: 'a@b.c',
  name: 'Admin',
  avatarUrl: null,
  role: 'admin' as const,
};

describe('resolveAdminAccess', () => {
  it('allows an authenticated admin', () => {
    expect(resolveAdminAccess({ isAuthenticated: true, user: adminUser })).toBe(
      'allowed'
    );
  });

  it('rejects an unauthenticated visitor', () => {
    expect(resolveAdminAccess({ isAuthenticated: false, user: null })).toBe(
      'unauthenticated'
    );
  });

  it('forbids an authenticated non-admin', () => {
    expect(
      resolveAdminAccess({
        isAuthenticated: true,
        user: { ...adminUser, role: 'user' as const },
      })
    ).toBe('forbidden');
  });

  it('forbids when the profile has no role yet', () => {
    const { role: _role, ...userWithoutRole } = adminUser;
    expect(
      resolveAdminAccess({ isAuthenticated: true, user: userWithoutRole })
    ).toBe('forbidden');
  });
});
