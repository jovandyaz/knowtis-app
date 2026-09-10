import { EventEmitter } from 'node:events';

import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  buildCollaborationService,
  redisExtensionOf,
} from './__tests__/collab-redis.fixture';
import { HocuspocusService } from './hocuspocus.service';

const REDIS_URL = 'redis://collab:s3cr3t-canary@redis.internal:6379';
const FAILURE_LOG_INTERVAL_MS = 30000;

interface FakeRedisClient extends EventEmitter {
  options: Record<string, unknown>;
}

const clients: FakeRedisClient[] = [];

vi.mock('ioredis', () => ({
  default: vi.fn(function (_url: string, options: Record<string, unknown>) {
    const client = Object.assign(new EventEmitter(), {
      options,
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
