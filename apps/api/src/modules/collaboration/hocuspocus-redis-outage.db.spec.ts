import { setTimeout as delay } from 'node:timers/promises';

import type { Redis as RedisExtension } from '@hocuspocus/extension-redis';
import {
  Document,
  type afterLoadDocumentPayload,
  type afterStoreDocumentPayload,
  type DirectConnection,
  type onStoreDocumentPayload,
} from '@hocuspocus/server';
import { Logger } from '@nestjs/common';
import type IORedis from 'ioredis';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildCollaborationService,
  createRedisOutage,
  documentChannel,
  hocuspocusOf,
  redisExtensionOf,
} from './__tests__/collab-redis.fixture';
import type { HocuspocusService } from './hocuspocus.service';

const REDIS_BLIP_MS = 600;
const READY_TIMEOUT_MS = 5000;
const PUBLISH_RETRY_BUDGET_TIMEOUT_MS = 30000;
const LONG_OUTAGE_SPEC_TIMEOUT_MS = 60000;
const PUBLISH_FAILED_REASON = 'publish_failed';
const ACCEPTANCE_MAP = 'acceptance';

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

describe('collaboration survives a redis outage longer than its retry budget', () => {
  const services: HocuspocusService[] = [];
  const connections: DirectConnection[] = [];
  const unhandledRejections: unknown[] = [];
  const recordUnhandledRejection = (reason: unknown) => {
    unhandledRejections.push(reason);
  };
  let outage: Awaited<ReturnType<typeof createRedisOutage>> | undefined;

  beforeEach(() => {
    process.on('unhandledRejection', recordUnhandledRejection);
  });

  afterEach(async () => {
    process.off('unhandledRejection', recordUnhandledRejection);
    await outage?.start();
    for (const connection of connections) {
      await connection.disconnect().catch(() => undefined);
    }
    for (const service of services) {
      await service.onModuleDestroy();
    }
    await outage?.stop();
    vi.restoreAllMocks();
    connections.length = 0;
    services.length = 0;
    unhandledRejections.length = 0;
    outage = undefined;
  }, LONG_OUTAGE_SPEC_TIMEOUT_MS);

  async function loadDocument(redisUrl: string, documentName: string) {
    const service = buildCollaborationService(redisUrl);
    services.push(service);
    service.onModuleInit();
    const connection =
      await hocuspocusOf(service).openDirectConnection(documentName);
    connections.push(connection);
    return { service, connection };
  }

  it(
    'reports a peer reply it could not publish instead of letting it reject unhandled',
    async () => {
      const warnings = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const upstreamUrl = process.env['REDIS_URL'] as string;
      const documentName = `reply-${crypto.randomUUID()}`;
      const writer = await loadDocument(upstreamUrl, documentName);
      const peerOutage = await createRedisOutage(upstreamUrl);
      outage = peerOutage;
      const peer = await loadDocument(peerOutage.url, documentName);
      const peerSubscriber = redisExtensionOf(peer.service)
        .sub as unknown as IORedis;
      const cutRedisAsThePeerReplies = (channel: Buffer) => {
        if (channel.toString() === documentChannel(documentName)) {
          peerSubscriber.off('messageBuffer', cutRedisAsThePeerReplies);
          void peerOutage.stop();
        }
      };
      peerSubscriber.on('messageBuffer', cutRedisAsThePeerReplies);

      await writer.connection.transact((document) => {
        document.getMap(ACCEPTANCE_MAP).set('during', 'outage');
      });

      const reportedPublishFailures = () =>
        warnings.mock.calls.filter(
          ([entry]) => entry?.reason === PUBLISH_FAILED_REASON
        );
      await vi.waitFor(
        () =>
          expect(
            unhandledRejections.length + reportedPublishFailures().length
          ).toBeGreaterThan(0),
        { timeout: PUBLISH_RETRY_BUDGET_TIMEOUT_MS }
      );
      expect(unhandledRejections).toEqual([]);
    },
    LONG_OUTAGE_SPEC_TIMEOUT_MS
  );
});
