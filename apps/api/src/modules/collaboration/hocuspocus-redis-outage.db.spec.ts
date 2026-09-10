import { setTimeout as delay } from 'node:timers/promises';

import type { Redis as RedisExtension } from '@hocuspocus/extension-redis';
import {
  Document,
  type afterLoadDocumentPayload,
  type afterStoreDocumentPayload,
  type onStoreDocumentPayload,
} from '@hocuspocus/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildCollaborationService,
  createRedisOutage,
  redisExtensionOf,
} from './__tests__/collab-redis.fixture';
import type { HocuspocusService } from './hocuspocus.service';

const REDIS_BLIP_MS = 600;
const READY_TIMEOUT_MS = 5000;

if (!process.env['REDIS_URL']) {
  throw new Error('REDIS_URL is required for collaboration redis outage specs');
}

describe('collaboration survives a redis outage shorter than its retry budget', () => {
  let service: HocuspocusService | undefined;
  let outage: Awaited<ReturnType<typeof createRedisOutage>> | undefined;

  afterEach(async () => {
    await service?.onModuleDestroy();
    await outage?.stop();
    service = undefined;
    outage = undefined;
  });

  it('acquires the store lock after the blip instead of skipping the durable write', async () => {
    outage = await createRedisOutage(process.env['REDIS_URL'] as string);
    service = buildCollaborationService(outage.url);
    service.onModuleInit();
    const extension = redisExtensionOf(service);
    const publisher = extension.pub as unknown as { status: string };
    await vi.waitFor(() => expect(publisher.status).toBe('ready'), {
      timeout: READY_TIMEOUT_MS,
    });

    const documentName = `outage-${crypto.randomUUID()}`;
    await outage.stop();
    const outcome = extension
      .onStoreDocument({ documentName } as onStoreDocumentPayload)
      .then(() => 'lock acquired' as const)
      .catch((error: Error) => error.message);
    await delay(REDIS_BLIP_MS);
    await outage.start();

    expect(await outcome).toBe('lock acquired');
    await extension.afterStoreDocument({
      documentName,
    } as afterStoreDocumentPayload);
  });

  it('loads a document after booting while redis was unreachable', async () => {
    outage = await createRedisOutage(process.env['REDIS_URL'] as string);
    await outage.stop();
    service = buildCollaborationService(outage.url);
    service.onModuleInit();
    const extension = redisExtensionOf(service);

    await delay(REDIS_BLIP_MS);
    await outage.start();

    const documentName = `boot-${crypto.randomUUID()}`;
    const document = new Document(documentName);
    const outcome = await extension
      .afterLoadDocument({
        documentName,
        document,
      } as afterLoadDocumentPayload)
      .then(() => 'document loaded' as const)
      .catch((error: Error) => error.message);

    expect(outcome).toBe('document loaded');
    await extension.afterUnloadDocument({
      documentName,
      instance: { documents: new Map() },
    } as unknown as Parameters<RedisExtension['afterUnloadDocument']>[0]);
    document.destroy();
  });
});
