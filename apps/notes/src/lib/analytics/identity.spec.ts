import type { AuthUserProfile } from '@jovandyaz/auth-react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createIdentitySynchronizer } from './identity';

const { posthog } = vi.hoisted(() => ({
  posthog: {
    __loaded: true,
    capture: vi.fn(),
    identify: vi.fn(),
    register: vi.fn(),
    reset: vi.fn(),
  },
}));

vi.mock('../posthog', () => ({ posthog }));

const REGISTERED_USER: AuthUserProfile = {
  id: 'user-1',
  email: 'person@example.com',
  name: 'Person',
  avatarUrl: null,
  role: 'user',
  locale: 'es',
};

describe('createIdentitySynchronizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers initial anonymous context without identifying or resetting', () => {
    createIdentitySynchronizer(posthog).sync({
      id: 'anonymous-1',
      email: '',
      name: 'Guest',
      avatarUrl: null,
      isAnonymous: true,
    });

    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.reset).not.toHaveBeenCalled();
    expect(posthog.register).toHaveBeenCalledWith({
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'es',
    });
  });

  it('identifies a registered user by database id with only allowed person properties', () => {
    createIdentitySynchronizer(posthog).sync({
      ...REGISTERED_USER,
      role: 'admin',
      locale: 'en',
    });

    expect(posthog.identify).toHaveBeenCalledWith('user-1', {
      email: 'person@example.com',
      name: 'Person',
      role: 'admin',
      locale: 'en',
      is_internal: true,
    });
    expect(posthog.register).toHaveBeenCalledWith({
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'registered',
      is_internal: true,
      locale: 'en',
    });
    expect(posthog.identify.mock.calls[0]?.[0]).not.toBe('person@example.com');
  });

  it('is idempotent for the same normalized identity and profile', () => {
    const synchronizer = createIdentitySynchronizer(posthog);

    synchronizer.sync(REGISTERED_USER);
    synchronizer.sync({ ...REGISTERED_USER, avatarUrl: '/new-avatar.png' });

    expect(posthog.identify).toHaveBeenCalledOnce();
    expect(posthog.register).toHaveBeenCalledOnce();
    expect(posthog.reset).not.toHaveBeenCalled();
  });

  it('refreshes identification and context when an allowed profile field changes', () => {
    const synchronizer = createIdentitySynchronizer(posthog);
    synchronizer.sync(REGISTERED_USER);

    synchronizer.sync({
      ...REGISTERED_USER,
      name: 'Updated Person',
      locale: 'en',
    });

    expect(posthog.identify).toHaveBeenCalledTimes(2);
    expect(posthog.identify).toHaveBeenLastCalledWith('user-1', {
      email: 'person@example.com',
      name: 'Updated Person',
      role: 'user',
      locale: 'en',
      is_internal: false,
    });
    expect(posthog.register).toHaveBeenLastCalledWith({
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'registered',
      is_internal: false,
      locale: 'en',
    });
  });

  it.each([
    ['signed out', null],
    [
      'anonymous',
      {
        id: 'anonymous-1',
        email: '',
        name: 'Guest',
        avatarUrl: null,
        isAnonymous: true,
      } satisfies AuthUserProfile,
    ],
  ])('resets before registering anonymous context when %s', (_, nextUser) => {
    const synchronizer = createIdentitySynchronizer(posthog);
    synchronizer.sync(REGISTERED_USER);
    vi.clearAllMocks();

    synchronizer.sync(nextUser);

    expect(posthog.reset).toHaveBeenCalledOnce();
    expect(posthog.identify).not.toHaveBeenCalled();
    expect(posthog.register).toHaveBeenCalledWith({
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'es',
    });
    expect(posthog.reset.mock.invocationCallOrder[0]).toBeLessThan(
      posthog.register.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('identifies anonymous to registered without resetting the browser journey', () => {
    const synchronizer = createIdentitySynchronizer(posthog);
    synchronizer.sync(null);
    vi.clearAllMocks();

    synchronizer.sync(REGISTERED_USER);

    expect(posthog.reset).not.toHaveBeenCalled();
    expect(posthog.identify).toHaveBeenCalledWith('user-1', {
      email: 'person@example.com',
      name: 'Person',
      role: 'user',
      locale: 'es',
      is_internal: false,
    });
  });

  it('contains identify failures and still registers and remembers context', () => {
    posthog.identify.mockImplementationOnce(() => {
      throw new Error('identify unavailable');
    });
    const synchronizer = createIdentitySynchronizer(posthog);

    expect(() => synchronizer.sync(REGISTERED_USER)).not.toThrow();
    expect(posthog.register).toHaveBeenCalledWith({
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'registered',
      is_internal: false,
      locale: 'es',
    });

    synchronizer.sync(REGISTERED_USER);
    expect(posthog.identify).toHaveBeenCalledOnce();
    expect(posthog.register).toHaveBeenCalledOnce();
  });

  it('contains reset failures and still registers anonymous context', () => {
    const synchronizer = createIdentitySynchronizer(posthog);
    synchronizer.sync(REGISTERED_USER);
    vi.clearAllMocks();
    posthog.reset.mockImplementationOnce(() => {
      throw new Error('reset unavailable');
    });

    expect(() => synchronizer.sync(null)).not.toThrow();
    expect(posthog.register).toHaveBeenCalledWith({
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'es',
    });
  });
});
