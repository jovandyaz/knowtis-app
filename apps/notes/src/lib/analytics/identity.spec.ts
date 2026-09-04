import type { AuthUserProfile } from '@jovandyaz/auth-react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createIdentityRetryController,
  createIdentitySynchronizer,
} from './identity';
import { captureProductEvent, setAnalyticsContext } from './product-events';
import { resumeAnalyticsCapture, setAnalyticsReady } from './runtime';

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
  afterEach(() => {
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    posthog.__loaded = true;
    setAnalyticsReady(true);
    resumeAnalyticsCapture();
    setAnalyticsContext({
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'es',
    });
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

  it('keeps capture paused after identify failure and retries the incomplete identity', () => {
    posthog.identify.mockImplementationOnce(() => {
      throw new Error('identify unavailable');
    });
    const synchronizer = createIdentitySynchronizer(posthog);

    expect(synchronizer.sync(REGISTERED_USER)).toBe(false);
    captureProductEvent('note activated', { source: 'editor' });
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(posthog.register).not.toHaveBeenCalled();

    expect(synchronizer.sync(REGISTERED_USER)).toBe(true);
    expect(posthog.identify).toHaveBeenCalledTimes(2);
    expect(posthog.register).toHaveBeenCalledWith({
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'registered',
      is_internal: false,
      locale: 'es',
    });
    captureProductEvent('note activated', { source: 'editor' });
    expect(posthog.capture).toHaveBeenCalledWith('note activated', {
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'registered',
      is_internal: false,
      locale: 'es',
      source: 'editor',
    });
    expect(posthog.register).toHaveBeenCalledOnce();
  });

  it('keeps capture paused after reset failure and retries before changing context', () => {
    const synchronizer = createIdentitySynchronizer(posthog);
    synchronizer.sync(REGISTERED_USER);
    vi.clearAllMocks();
    posthog.reset.mockImplementationOnce(() => {
      throw new Error('reset unavailable');
    });

    expect(synchronizer.sync(null)).toBe(false);
    captureProductEvent('note activated', { source: 'editor' });
    expect(posthog.capture).not.toHaveBeenCalled();
    expect(posthog.register).not.toHaveBeenCalled();

    expect(synchronizer.sync(null)).toBe(true);
    expect(posthog.reset).toHaveBeenCalledTimes(2);
    expect(posthog.register).toHaveBeenCalledWith({
      environment: 'production',
      app_version: '0.1.0',
      actor_type: 'anonymous',
      is_internal: false,
      locale: 'es',
    });
  });

  it('resets before identifying and registering a different registered user', () => {
    const synchronizer = createIdentitySynchronizer(posthog);
    synchronizer.sync(REGISTERED_USER);
    vi.clearAllMocks();

    expect(
      synchronizer.sync({
        ...REGISTERED_USER,
        id: 'user-2',
        email: 'other@example.com',
        name: 'Other Person',
      })
    ).toBe(true);

    expect(posthog.reset).toHaveBeenCalledOnce();
    expect(posthog.identify).toHaveBeenCalledWith('user-2', {
      email: 'other@example.com',
      name: 'Other Person',
      role: 'user',
      locale: 'es',
      is_internal: false,
    });
    expect(posthog.reset.mock.invocationCallOrder[0]).toBeLessThan(
      posthog.identify.mock.invocationCallOrder[0] ?? 0
    );
    expect(posthog.identify.mock.invocationCallOrder[0]).toBeLessThan(
      posthog.register.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('retries a failed identity sync and stops after the bounded attempt count', () => {
    vi.useFakeTimers();
    const sync = vi.fn().mockReturnValue(false);
    const controller = createIdentityRetryController({ sync });

    controller.sync(REGISTERED_USER);
    vi.runAllTimers();

    expect(sync).toHaveBeenCalledTimes(3);
    controller.stop();
  });

  it('cancels pending identity retries on state change and cleanup', () => {
    vi.useFakeTimers();
    const sync = vi.fn().mockReturnValueOnce(false).mockReturnValueOnce(true);
    const controller = createIdentityRetryController({ sync });
    const nextUser = { ...REGISTERED_USER, id: 'user-2' };

    controller.sync(REGISTERED_USER);
    controller.sync(nextUser);
    vi.runAllTimers();

    expect(sync).toHaveBeenCalledTimes(2);
    expect(sync).toHaveBeenNthCalledWith(1, REGISTERED_USER);
    expect(sync).toHaveBeenNthCalledWith(2, nextUser);

    sync.mockReturnValue(false);
    controller.sync(REGISTERED_USER);
    controller.stop();
    vi.runAllTimers();
    expect(sync).toHaveBeenCalledTimes(3);
  });
});
