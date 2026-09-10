import { Redis as RedisExtension } from '@hocuspocus/extension-redis';
import { ConfigService } from '@nestjs/config';
import { HttpAdapterHost } from '@nestjs/core';

import type { EnvConfig } from '../../../config/env.config';
import { HocuspocusAuthExtension } from '../extensions/hocuspocus-auth.extension';
import { HocuspocusPersistenceExtension } from '../extensions/hocuspocus-persistence.extension';
import { HocuspocusService } from '../hocuspocus.service';

/** Boots the real service against `redisUrl`, with the non-Redis extensions stubbed. */
export function buildCollaborationService(redisUrl: string): HocuspocusService {
  return new HocuspocusService(
    {
      guardHooks: () => ({}),
      toExtension: () => ({ priority: 100 }),
    } as unknown as HocuspocusAuthExtension,
    {
      toExtension: () => ({ priority: 1000 }),
    } as unknown as HocuspocusPersistenceExtension,
    new ConfigService({ REDIS_URL: redisUrl }) as ConfigService<
      EnvConfig,
      true
    >,
    { httpAdapter: undefined } as unknown as HttpAdapterHost
  );
}

/** The registered Redis extension, so a spec can drive its real hooks and clients. */
export function redisExtensionOf(service: HocuspocusService): RedisExtension {
  const { extensions } = (
    service as unknown as {
      server: { hocuspocus: { configuration: { extensions: unknown[] } } };
    }
  ).server.hocuspocus.configuration;
  const extension = extensions.find(
    (candidate) => candidate instanceof RedisExtension
  );
  if (!(extension instanceof RedisExtension)) {
    throw new Error('Redis extension was not registered');
  }
  return extension;
}
