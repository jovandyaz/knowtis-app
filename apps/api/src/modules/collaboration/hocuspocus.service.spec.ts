import { EventEmitter } from 'node:events';

import type { Document } from '@hocuspocus/server';
import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildCollaborationService,
  hocuspocusOf,
  redisExtensionOf,
} from './__tests__/collab-redis.fixture';
import { HocuspocusService } from './hocuspocus.service';

const REDIS_URL = 'redis://collab:s3cr3t-canary@redis.internal:6379';
const FAILURE_LOG_INTERVAL_MS = 30000;

interface FakeRedisClient extends EventEmitter {
  options: Record<string, unknown>;
  status: string;
}

const clients: FakeRedisClient[] = [];

function loadedDocument(connections: number): Document {
  return { getConnectionsCount: () => connections } as unknown as Document;
}

function redisPair(): [FakeRedisClient, FakeRedisClient] {
  const [publisher, subscriber] = clients;
  if (!publisher || !subscriber) {
    throw new Error('Expected a publisher and a subscriber client');
  }
  return [publisher, subscriber];
}

vi.mock('ioredis', () => ({
  default: vi.fn(function (_url: string, options: Record<string, unknown>) {
    const client = Object.assign(new EventEmitter(), {
      options,
      status: 'connecting',
      publish: vi.fn().mockResolvedValue(1),
      subscribe: vi.fn(),
      unsubscribe: vi.fn(),
      pubsub: vi.fn().mockResolvedValue([]),
      defineCommand: vi.fn(),
      quit: vi.fn().mockResolvedValue('OK'),
      disconnect: vi.fn(),
    });
    clients.push(client);
    return client;
  }),
}));

describe('collaboration redis clients', () => {
  let service: HocuspocusService;
  let warnings: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    clients.length = 0;
    warnings = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    service = buildCollaborationService(REDIS_URL);
    service.onModuleInit();
  });

  afterEach(async () => {
    hocuspocusOf(service).documents.clear();
    await service.onModuleDestroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('builds exactly one publisher then one subscriber, each named for its role', () => {
    expect(clients).toHaveLength(2);
    const [publisher, subscriber] = clients;
    expect(publisher?.options['connectionName']).toBe(
      `knowtis-collab:publisher:${process.pid}`
    );
    expect(subscriber?.options['connectionName']).toBe(
      `knowtis-collab:subscriber:${process.pid}`
    );
  });

  it('hands the first client it builds to the extension as the publisher', () => {
    const extension = redisExtensionOf(service);
    expect(extension.pub).toBe(clients[0]);
    expect(extension.sub).toBe(clients[1]);
  });

  it('leaves the publisher retry budget wide enough to outlast a Redis blip', () => {
    expect(clients[0]?.options['maxRetriesPerRequest']).toBe(20);
  });

  it('never lets the subscriber give up, so a boot-time outage cannot poison it', () => {
    expect(clients[1]?.options['maxRetriesPerRequest']).toBeNull();
  });

  it('bounds how long either client waits on a connect attempt', () => {
    for (const client of clients) {
      expect(client.options['connectTimeout']).toBe(1000);
    }
  });

  it('handles error events on both clients so ioredis never dumps them raw', () => {
    for (const client of clients) {
      expect(client.listenerCount('error')).toBeGreaterThan(0);
    }
  });

  it('announces nothing until both clients are ready, so a lagging publisher cannot drop it', () => {
    const announce = vi
      .spyOn(redisExtensionOf(service), 'onChange')
      .mockResolvedValue(undefined);
    hocuspocusOf(service).documents.set('note-with-editors', {
      getConnectionsCount: () => 1,
    } as unknown as Document);
    const [publisher, subscriber] = redisPair();

    subscriber.status = 'ready';
    subscriber.emit('ready');
    expect(announce).not.toHaveBeenCalled();

    publisher.status = 'ready';
    publisher.emit('ready');
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce.mock.calls[0]?.[0]).toMatchObject({
      documentName: 'note-with-editors',
    });
  });

  it('announces when the publisher is the one that recovers last', () => {
    const announce = vi
      .spyOn(redisExtensionOf(service), 'onChange')
      .mockResolvedValue(undefined);
    hocuspocusOf(service).documents.set('note-with-editors', loadedDocument(1));
    const [publisher, subscriber] = redisPair();

    publisher.status = 'ready';
    publisher.emit('ready');
    expect(announce).not.toHaveBeenCalled();

    subscriber.status = 'ready';
    subscriber.emit('ready');
    expect(announce).toHaveBeenCalledTimes(1);
  });

  it('re-announces a loaded document nobody is connected to, since a new client is served it from memory', () => {
    const announce = vi
      .spyOn(redisExtensionOf(service), 'onChange')
      .mockResolvedValue(undefined);
    const { documents } = hocuspocusOf(service);
    documents.set('note-with-editors', loadedDocument(1));
    documents.set('note-nobody-is-editing', loadedDocument(0));
    for (const client of clients) {
      client.status = 'ready';
    }

    redisPair()[1].emit('ready');

    expect(announce).toHaveBeenCalledTimes(2);
    expect(announce.mock.calls.map((call) => call[0]?.documentName)).toEqual([
      'note-with-editors',
      'note-nobody-is-editing',
    ]);
  });

  it('throttles each failure reason on its own clock', async () => {
    const failure = new Error('connect ECONNREFUSED 10.0.0.4:6379');
    vi.spyOn(redisExtensionOf(service), 'onChange').mockRejectedValue(failure);
    hocuspocusOf(service).documents.set('note-with-editors', loadedDocument(1));
    const [publisher, subscriber] = redisPair();

    publisher.emit('error', failure);
    await vi.advanceTimersByTimeAsync(1);
    expect(warnings).toHaveBeenCalledTimes(1);

    publisher.status = 'ready';
    subscriber.status = 'ready';
    subscriber.emit('ready');
    await vi.advanceTimersByTimeAsync(1);

    expect(warnings).toHaveBeenCalledTimes(2);
    expect(warnings).toHaveBeenCalledWith({
      operation: 'collaboration_redis',
      role: 'publisher',
      reason: 'resync_failed',
      message: failure.message,
    });
  });

  it('warns once per role per interval and never echoes the connection url', async () => {
    for (const client of clients) {
      client.emit('error', new Error('connect ECONNREFUSED 10.0.0.4:6379'));
      client.emit('error', new Error('connect ECONNREFUSED 10.0.0.4:6379'));
    }
    await vi.advanceTimersByTimeAsync(1);
    expect(warnings).toHaveBeenCalledTimes(2);
    for (const role of ['publisher', 'subscriber']) {
      expect(warnings).toHaveBeenCalledWith({
        operation: 'collaboration_redis',
        role,
        reason: 'connection_failed',
        message: 'connect ECONNREFUSED 10.0.0.4:6379',
      });
    }
    expect(JSON.stringify(warnings.mock.calls)).not.toContain('s3cr3t-canary');

    await vi.advanceTimersByTimeAsync(FAILURE_LOG_INTERVAL_MS);
    clients[1]?.emit('error', new Error('connect ECONNREFUSED 10.0.0.4:6379'));
    expect(warnings).toHaveBeenCalledTimes(3);
  });
});
