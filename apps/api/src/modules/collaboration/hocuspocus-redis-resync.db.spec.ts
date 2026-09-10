import type { DirectConnection } from '@hocuspocus/server';
import type IORedis from 'ioredis';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  buildCollaborationService,
  createCollabPublishObserver,
  createRedisOutage,
  hocuspocusOf,
  redisExtensionOf,
} from './__tests__/collab-redis.fixture';
import type { HocuspocusService } from './hocuspocus.service';

const READY_TIMEOUT_MS = 10000;
const CONVERGENCE_TIMEOUT_MS = 20000;
const SPEC_TIMEOUT_MS = 90000;
const ACCEPTANCE_MAP = 'acceptance';

if (!process.env['REDIS_URL']) {
  throw new Error('REDIS_URL is required for collaboration redis resync specs');
}

type Outage = Awaited<ReturnType<typeof createRedisOutage>>;
type PublishObserver = Awaited<ReturnType<typeof createCollabPublishObserver>>;

async function waitForRoundTrip(client: IORedis) {
  await vi.waitFor(async () => expect(await client.ping()).toBe('PONG'), {
    timeout: READY_TIMEOUT_MS,
  });
}

describe('a peer that resubscribes after the update was published', () => {
  const services: HocuspocusService[] = [];
  const outages: Outage[] = [];
  const connections: DirectConnection[] = [];
  const observers: PublishObserver[] = [];

  afterEach(async () => {
    for (const connection of connections) {
      await connection.disconnect().catch(() => undefined);
    }
    for (const service of services) {
      await service.onModuleDestroy().catch(() => undefined);
    }
    for (const outage of outages) {
      await outage.stop();
    }
    for (const observer of observers) {
      await observer.stop();
    }
    connections.length = 0;
    services.length = 0;
    outages.length = 0;
    observers.length = 0;
  });

  async function startInstance(documentName: string) {
    const outage = await createRedisOutage(process.env['REDIS_URL'] as string);
    outages.push(outage);
    const service = buildCollaborationService(outage.url);
    services.push(service);
    service.onModuleInit();
    const publisher = redisExtensionOf(service).pub as unknown as IORedis;
    await waitForRoundTrip(publisher);
    const connection =
      await hocuspocusOf(service).openDirectConnection(documentName);
    connections.push(connection);
    const { document } = connection;
    if (!document) {
      throw new Error('DirectConnection opened without a document');
    }
    return { outage, service, publisher, connection, document };
  }

  it(
    'receives the update that was published while it was disconnected',
    async () => {
      const documentName = `resync-${crypto.randomUUID()}`;
      const observer = await createCollabPublishObserver(
        process.env['REDIS_URL'] as string
      );
      observers.push(observer);
      await observer.watch(documentName);
      const writer = await startInstance(documentName);
      const peer = await startInstance(documentName);

      await writer.connection.transact((document) => {
        document.getMap(ACCEPTANCE_MAP).set('before', 'shared');
      });
      await vi.waitFor(
        () =>
          expect(peer.document.getMap(ACCEPTANCE_MAP).get('before')).toBe(
            'shared'
          ),
        { timeout: CONVERGENCE_TIMEOUT_MS }
      );

      await writer.outage.stop();
      await peer.outage.stop();
      await writer.outage.start();
      await waitForRoundTrip(writer.publisher);

      const publishesBeforeRecovery = observer.publishCount(documentName);
      await writer.connection.transact((document) => {
        document.getMap(ACCEPTANCE_MAP).set('recovered', 'new session');
      });
      await vi.waitFor(
        () =>
          expect(observer.publishCount(documentName)).toBeGreaterThan(
            publishesBeforeRecovery
          ),
        { timeout: CONVERGENCE_TIMEOUT_MS }
      );
      await peer.outage.start();

      await vi.waitFor(
        () =>
          expect(peer.document.getMap(ACCEPTANCE_MAP).get('recovered')).toBe(
            'new session'
          ),
        { timeout: CONVERGENCE_TIMEOUT_MS }
      );
    },
    SPEC_TIMEOUT_MS
  );
});
