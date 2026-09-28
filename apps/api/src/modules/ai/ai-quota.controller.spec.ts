import { JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import {
  Logger,
  type ExecutionContext,
  type INestApplication,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Test } from '@nestjs/testing';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { FeatureFlagGuard } from '../feature-flags/feature-flag.guard';
import { AiQuotaController } from './ai-quota.controller';
import { AIConfigService } from './application/services/ai-config.service';
import { MessageQuotaService } from './application/services/message-quota.service';
import { TierResolver } from './application/services/tier-resolver.service';
import { AiUnavailableError } from './domain/errors/ai-unavailable.error';
import {
  MESSAGE_QUOTA_PORT,
  USER_MESSAGE_COUNT_PORT,
} from './domain/ports/message-quota.port';
import { createExecutionContext } from './testing/create-execution-context';

const MIDNIGHT_UTC = /T00:00:00\.000Z$/;

describe('GET /ai/quota', () => {
  let app: INestApplication;
  let base: string;
  const resolve = vi.fn();
  const counters = { consume: vi.fn(), refund: vi.fn(), usage: vi.fn() };
  const persisted = { countUserMessages: vi.fn() };
  let currentUser: { id: string; role: string; isAnonymous?: boolean };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AiQuotaController],
      providers: [
        MessageQuotaService,
        { provide: TierResolver, useValue: { resolve } },
        { provide: MESSAGE_QUOTA_PORT, useValue: counters },
        { provide: USER_MESSAGE_COUNT_PORT, useValue: persisted },
        {
          provide: AIConfigService,
          useValue: {
            getDailyMessageLimits: vi
              .fn()
              .mockResolvedValue({ anonymous: 5, free: 30 }),
          },
        },
        { provide: EventEmitter2, useValue: { emit: vi.fn() } },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: ExecutionContext) => {
          ctx.switchToHttp().getRequest().user = currentUser;
          return true;
        },
      })
      .overrideGuard(FeatureFlagGuard)
      .useValue({ canActivate: () => true })
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0);
    base = await app.getUrl();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    resolve.mockReset();
    counters.usage.mockReset();
    persisted.countUserMessages.mockReset();
  });

  const get = (init?: RequestInit) => fetch(`${base}/ai/quota`, init);

  it('reports an anonymous caller under its session and IP, against the anonymous limit', async () => {
    currentUser = { id: 'anon-1', role: 'user', isAnonymous: true };
    resolve.mockResolvedValue(
      createExecutionContext({
        tier: 'anonymous',
        userId: 'anon-1',
        clientIp: '203.0.113.7',
      })
    );
    counters.usage.mockResolvedValue(2);

    const response = await get({
      headers: { 'x-real-ip': '203.0.113.7' },
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      tier: 'anonymous',
      messages: {
        used: 2,
        limit: 5,
        resetsAt: expect.stringMatching(MIDNIGHT_UTC),
      },
    });
    expect(resolve).toHaveBeenCalledWith({
      userId: 'anon-1',
      isAnonymous: true,
      clientIp: '203.0.113.7',
    });
    expect(counters.usage).toHaveBeenCalledWith(
      ['anon-1', 'ip:fec52565aa0cf18f'],
      expect.anything()
    );
  });

  it('reports a free caller against the free limit', async () => {
    currentUser = { id: 'u1', role: 'user' };
    resolve.mockResolvedValue(
      createExecutionContext({ tier: 'free', userId: 'u1' })
    );
    counters.usage.mockResolvedValue(12);

    await expect((await get()).json()).resolves.toMatchObject({
      tier: 'free',
      messages: { used: 12, limit: 30 },
    });
    expect(counters.usage).toHaveBeenCalledWith(['u1'], expect.anything());
  });

  it('reports no message counter to a byok caller', async () => {
    currentUser = { id: 'u1', role: 'user' };
    resolve.mockResolvedValue(
      createExecutionContext({
        tier: 'byok',
        userId: 'u1',
        byokProviders: ['anthropic'],
      })
    );

    await expect((await get()).json()).resolves.toEqual({
      tier: 'byok',
      messages: null,
    });
    expect(counters.usage).not.toHaveBeenCalled();
  });

  it('reads a free caller from Postgres when the counters are down', async () => {
    currentUser = { id: 'u1', role: 'user' };
    resolve.mockResolvedValue(
      createExecutionContext({ tier: 'free', userId: 'u1' })
    );
    counters.usage.mockRejectedValue(new Error('ECONNREFUSED'));
    persisted.countUserMessages.mockResolvedValue(7);

    await expect((await get()).json()).resolves.toMatchObject({
      messages: { used: 7, limit: 30 },
    });
  });

  it('answers 503 when the tier cannot be resolved', async () => {
    currentUser = { id: 'u1', role: 'user' };
    resolve.mockRejectedValue(new AiUnavailableError('tier', 'db down'));

    const response = await get();

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('5');
  });

  it('answers 503 when an anonymous caller counters are down', async () => {
    currentUser = { id: 'anon-1', role: 'user', isAnonymous: true };
    resolve.mockResolvedValue(
      createExecutionContext({ tier: 'anonymous', userId: 'anon-1' })
    );
    counters.usage.mockRejectedValue(new Error('ECONNREFUSED'));

    const response = await get();

    expect(response.status).toBe(503);
    expect(response.headers.get('retry-after')).toBe('5');
  });
});
