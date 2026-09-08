import { EventEmitter } from 'node:events';

import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ACCESS_INVALIDATION_CHANNEL,
  AccessInvalidationBus,
  parseAccessInvalidation,
} from './access-invalidation.bus';
import { AccessRevalidationService } from './access-revalidation.service';

const redisClients: Array<
  EventEmitter & {
    connect: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
    disconnect: ReturnType<typeof vi.fn>;
  }
> = [];
const canary =
  'redis://user:password@private recipient@example.test token-canary fingerprint-canary payload-content';
vi.mock('ioredis', () => ({
  default: vi.fn(function () {
    const client = Object.assign(new EventEmitter(), {
      connect: vi.fn().mockRejectedValue(new Error(canary)),
      subscribe: vi.fn().mockResolvedValue(undefined),
      disconnect: vi.fn(),
    });
    redisClients.push(client);
    return client;
  }),
}));

const noteId = 'fb4a229f-65be-42c2-b584-c19a0141866e';
describe('access invalidation wire boundary', () => {
  it('accepts only a versioned note identity, never a permission verdict', () => {
    expect(
      parseAccessInvalidation(JSON.stringify({ version: 1, noteId }))
    ).toBe(noteId);
    expect(
      parseAccessInvalidation(
        JSON.stringify({ version: 1, noteId, permission: 'owner' })
      )
    ).toBe(null);
  });
  it.each([
    '{',
    'null',
    '[]',
    'x'.repeat(257),
    JSON.stringify({ version: 2, noteId }),
    JSON.stringify({ version: 1, noteId: 'not-a-uuid' }),
  ])('ignores malformed or unsupported payload %s', (payload) => {
    expect(parseAccessInvalidation(payload)).toBe(null);
  });
});

describe('access invalidation operational failures', () => {
  let bus: AccessInvalidationBus;
  let access: AccessRevalidationService;
  let warnings: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    redisClients.length = 0;
    warnings = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    access = new AccessRevalidationService({ findAccessSnapshot: vi.fn() });
    bus = new AccessInvalidationBus(
      new ConfigService({ REDIS_URL: 'redis://test' }),
      access
    );
  });
  afterEach(() => {
    bus.onModuleDestroy();
    access.onModuleDestroy();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('warns once per client for duplicate connection failures without exposing driver data', async () => {
    bus.onModuleInit();
    for (const client of redisClients) {
      client.emit('error', new Error(canary));
      client.emit('error', new Error(canary));
    }
    await vi.advanceTimersByTimeAsync(1);
    expect(warnings).toHaveBeenCalledTimes(2);
    for (const clientRole of ['publisher', 'subscriber']) {
      expect(warnings).toHaveBeenCalledWith({
        operation: 'access_invalidation_redis',
        clientRole,
        reason: 'connection_failed',
      });
    }
    expect(JSON.stringify(warnings.mock.calls)).not.toContain(canary);
    await vi.advanceTimersByTimeAsync(30000);
    redisClients[1].emit('error', new Error(canary));
    expect(warnings).toHaveBeenCalledTimes(3);
  });

  it('bounds subscription failure warnings and still sweeps authority after recovery', async () => {
    const sweep = vi
      .spyOn(access, 'invalidateAll')
      .mockResolvedValue(undefined);
    const invalidate = vi
      .spyOn(access, 'invalidate')
      .mockResolvedValue(undefined);
    bus.onModuleInit();
    await vi.advanceTimersByTimeAsync(1);
    warnings.mockClear();
    await vi.advanceTimersByTimeAsync(30000);
    const subscriber = redisClients[1];
    subscriber.subscribe.mockRejectedValue(new Error(canary));
    subscriber.emit('ready');
    await vi.advanceTimersByTimeAsync(10001);
    expect(warnings).toHaveBeenCalledExactlyOnceWith({
      operation: 'access_invalidation_redis',
      clientRole: 'subscriber',
      reason: 'subscription_failed',
    });
    expect(sweep).not.toHaveBeenCalled();
    subscriber.subscribe.mockResolvedValue(undefined);
    await vi.advanceTimersByTimeAsync(1000);
    expect(sweep).toHaveBeenCalledTimes(1);
    subscriber.emit(
      'message',
      ACCESS_INVALIDATION_CHANNEL,
      JSON.stringify({ version: 1, noteId })
    );
    expect(invalidate).toHaveBeenCalledWith(noteId);
    invalidate.mockClear();
    subscriber.emit(
      'message',
      'unrelated-channel',
      JSON.stringify({ version: 1, noteId })
    );
    expect(invalidate).not.toHaveBeenCalled();
    expect(JSON.stringify(warnings.mock.calls)).not.toContain(canary);
    bus.onModuleDestroy();
    subscriber.emit('error', new Error(canary));
    expect(warnings).toHaveBeenCalledTimes(1);
  });
});
