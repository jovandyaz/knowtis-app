import { Global, Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { I18nService } from 'nestjs-i18n';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DATABASE_CONNECTION } from '../../database';
import { AnalyticsModule } from './analytics.module';
import { ProductAnalytics } from './product-analytics.service';

const { capture, shutdown, PostHog } = vi.hoisted(() => {
  const capture = vi.fn();
  const shutdown = vi.fn().mockResolvedValue(undefined);
  const PostHog = vi.fn(function () {
    return { capture, shutdown };
  });

  return { capture, shutdown, PostHog };
});

vi.mock('posthog-node', () => ({ PostHog }));

@Global()
@Module({
  providers: [
    { provide: DATABASE_CONNECTION, useValue: {} },
    { provide: I18nService, useValue: { t: vi.fn() } },
  ],
  exports: [DATABASE_CONNECTION, I18nService],
})
class StubInfrastructureModule {}

function createConfigService(env: Record<string, string | undefined>) {
  return {
    get: vi.fn((key: string) => env[key]),
  } as unknown as ConfigService;
}

async function createAnalytics(env: Record<string, string | undefined>) {
  const module = await Test.createTestingModule({
    imports: [StubInfrastructureModule, AnalyticsModule],
  })
    .overrideProvider(ConfigService)
    .useValue(createConfigService(env))
    .compile();

  return {
    analytics: module.get(ProductAnalytics),
    close: () => module.close(),
  };
}

describe('ProductAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shutdown.mockResolvedValue(undefined);
  });

  it('queues a typed event with server common and person properties', async () => {
    const { analytics, close } = await createAnalytics({
      NODE_ENV: 'production',
      POSTHOG_PROJECT_TOKEN: 'project-token',
      POSTHOG_HOST: 'https://us.i.posthog.com',
      RAILWAY_GIT_COMMIT_SHA: 'sha-123',
    });

    analytics.capture({
      distinctId: 'user-1',
      event: 'user signed up',
      properties: { source: 'api' },
      actor: { actor_type: 'registered', is_internal: false, locale: 'es' },
      personProperties: {
        email: 'person@example.com',
        name: 'Person',
        role: 'user',
        locale: 'es',
        is_internal: false,
      },
    });

    expect(capture).toHaveBeenCalledWith({
      distinctId: 'user-1',
      event: 'user signed up',
      properties: {
        environment: 'production',
        app_version: 'sha-123',
        source: 'api',
        actor_type: 'registered',
        is_internal: false,
        locale: 'es',
        $set: {
          email: 'person@example.com',
          name: 'Person',
          role: 'user',
          locale: 'es',
          is_internal: false,
        },
      },
    });

    await close();
  });

  it('runtime-picks exact event, actor, and person allowlists from structural variables', async () => {
    const { analytics, close } = await createAnalytics({
      NODE_ENV: 'production',
      POSTHOG_PROJECT_TOKEN: 'project-token',
      POSTHOG_HOST: 'https://us.i.posthog.com',
      RAILWAY_GIT_COMMIT_SHA: 'sha-allowlist',
    });
    const properties = {
      source: 'api' as const,
      verification_method: 'link' as const,
      noteId: 'private-note-id',
      content: 'private-content',
      optionalExtra: undefined,
    };
    const actor = {
      actor_type: 'registered' as const,
      is_internal: true,
      locale: 'en',
      userId: 'private-user-id',
    };
    const personProperties = {
      email: 'person@example.com',
      name: 'Person',
      role: 'admin' as const,
      locale: 'en',
      is_internal: true,
      arbitraryPersonField: 'private-person-value',
      noteId: 'private-person-note-id',
      optionalExtra: undefined,
    };

    analytics.capture({
      distinctId: 'user-1',
      event: 'email verified',
      properties,
      actor,
      personProperties,
    });

    expect(capture).toHaveBeenCalledWith({
      distinctId: 'user-1',
      event: 'email verified',
      properties: {
        environment: 'production',
        app_version: 'sha-allowlist',
        source: 'api',
        verification_method: 'link',
        actor_type: 'registered',
        is_internal: true,
        locale: 'en',
        $set: {
          email: 'person@example.com',
          name: 'Person',
          role: 'admin',
          locale: 'en',
          is_internal: true,
        },
      },
    });

    await close();
  });

  it('does not throw when the PostHog client is unavailable', async () => {
    const { analytics, close } = await createAnalytics({ NODE_ENV: 'test' });

    expect(() =>
      analytics.capture({
        distinctId: 'user-1',
        event: 'user signed up',
        properties: { source: 'api' },
        actor: { actor_type: 'registered', is_internal: false, locale: 'es' },
      })
    ).not.toThrow();
    expect(capture).not.toHaveBeenCalled();

    await close();
  });

  it.each(['test', 'development'] as const)(
    'does not construct a client in %s',
    async (NODE_ENV) => {
      const { close } = await createAnalytics({
        NODE_ENV,
        POSTHOG_PROJECT_TOKEN: 'project-token',
      });

      expect(PostHog).not.toHaveBeenCalled();
      await close();
    }
  );

  it('does not construct a client without a project token', async () => {
    const { close } = await createAnalytics({ NODE_ENV: 'production' });

    expect(PostHog).not.toHaveBeenCalled();
    await close();
  });

  it('constructs a production client with the configured PostHog host', async () => {
    const { close } = await createAnalytics({
      NODE_ENV: 'production',
      POSTHOG_PROJECT_TOKEN: 'project-token',
      POSTHOG_HOST: 'https://eu.i.posthog.com',
    });

    expect(PostHog).toHaveBeenCalledWith('project-token', {
      host: 'https://eu.i.posthog.com',
    });
    await close();
  });

  it('swallows client capture failures and logs only the event name', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    capture.mockImplementationOnce(() => {
      throw new Error('queue unavailable');
    });
    const { analytics, close } = await createAnalytics({
      NODE_ENV: 'production',
      POSTHOG_PROJECT_TOKEN: 'project-token',
      POSTHOG_HOST: 'https://us.i.posthog.com',
    });

    expect(() =>
      analytics.capture({
        distinctId: 'private-user-id',
        event: 'user signed up',
        properties: { source: 'api' },
        actor: { actor_type: 'registered', is_internal: true, locale: 'es' },
      })
    ).not.toThrow();
    expect(errorSpy).toHaveBeenCalledWith(
      'PostHog capture failed for event: user signed up'
    );
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain(
      'private-user-id'
    );

    errorSpy.mockRestore();
    await close();
  });

  it('awaits PostHog shutdown and swallows shutdown failures without payloads', async () => {
    const errorSpy = vi
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    shutdown.mockRejectedValueOnce(new Error('shutdown unavailable'));
    const { analytics, close } = await createAnalytics({
      NODE_ENV: 'production',
      POSTHOG_PROJECT_TOKEN: 'project-token',
      POSTHOG_HOST: 'https://us.i.posthog.com',
    });

    await expect(analytics.onApplicationShutdown()).resolves.toBeUndefined();
    expect(shutdown).toHaveBeenCalledOnce();
    expect(errorSpy).toHaveBeenCalledWith('PostHog shutdown failed');

    errorSpy.mockRestore();
    await close();
  });
});
