import { Logger } from '@nestjs/common';
import type { EventEmitter2 } from '@nestjs/event-emitter';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AccessTier } from '@knowtis/shared-types';

import { AiUnavailableError } from '../../domain/errors/ai-unavailable.error';
import { MessageQuotaConsumedEvent } from '../../domain/events/message-quota-consumed.event';
import { MessageQuotaExhaustedEvent } from '../../domain/events/message-quota-exhausted.event';
import type { DailyMessageLimits } from '../../domain/execution-context/quota-policy';
import type {
  MessageQuotaPort,
  UserMessageCountPort,
} from '../../domain/ports/message-quota.port';
import { createExecutionContext } from '../../testing/create-execution-context';
import type { AIConfigService } from './ai-config.service';
import {
  MessageQuotaService,
  QUOTA_STORES,
  type QuotaReceipt,
} from './message-quota.service';

const NOW = new Date('2026-09-27T12:00:00.000Z');
const RESETS_AT = '2026-09-28T00:00:00.000Z';
const TURN = '55555555-5555-4555-8555-555555555555';
const LIMITS: DailyMessageLimits = { anonymous: 5, free: 30 };
const IP_SUBJECT = 'ip:fec52565aa0cf18f';

function setup(
  over: {
    counters?: Partial<MessageQuotaPort>;
    persisted?: Partial<UserMessageCountPort>;
    limits?: DailyMessageLimits;
  } = {}
) {
  const counters = {
    consume: vi
      .fn()
      .mockResolvedValue({ allowed: true, used: 1, replayed: false }),
    refund: vi.fn().mockResolvedValue(true),
    usage: vi.fn().mockResolvedValue(0),
    ...over.counters,
  };
  const persisted = {
    countUserMessages: vi.fn().mockResolvedValue(0),
    ...over.persisted,
  };
  const aiConfig = {
    getDailyMessageLimits: vi.fn().mockResolvedValue(over.limits ?? LIMITS),
  } as unknown as AIConfigService;
  const events = { emit: vi.fn() } as unknown as EventEmitter2;
  const service = new MessageQuotaService(
    counters,
    persisted,
    aiConfig,
    events
  );
  return { service, counters, persisted, events };
}

const down = () => vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));

async function receiptFrom(
  service: MessageQuotaService,
  tier: AccessTier = 'free'
): Promise<QuotaReceipt> {
  const outcome = await service.consume(createExecutionContext({ tier }), TURN);
  if (outcome.kind !== 'consumed') {
    throw new Error(`expected a consumed outcome, got ${outcome.kind}`);
  }
  return outcome.receipt;
}

describe('MessageQuotaService', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('consume', () => {
    it('never touches the counters for a turn billed to the caller key', async () => {
      const { service, counters, persisted } = setup();

      const outcome = await service.consume(
        createExecutionContext({
          tier: 'byok',
          billing: { kind: 'byok', provider: 'anthropic' },
        }),
        TURN
      );

      expect(outcome).toEqual({ kind: 'unmetered' });
      expect(counters.consume).not.toHaveBeenCalled();
      expect(persisted.countUserMessages).not.toHaveBeenCalled();
    });

    it('meters a byok-tier caller on a platform model under the free limit, showing no counter', async () => {
      const { service, counters } = setup();

      const outcome = await service.consume(
        createExecutionContext({ tier: 'byok', byokProviders: ['anthropic'] }),
        TURN
      );

      expect(counters.consume).toHaveBeenCalledWith(
        {
          subjects: ['user-1'],
          turnId: TURN,
          day: expect.objectContaining({ key: '2026-09-27' }),
        },
        30
      );
      expect(outcome).toMatchObject({
        kind: 'consumed',
        quota: { tier: 'byok', messages: null },
      });
    });

    it('meters an anonymous caller under its session and its IP together', async () => {
      const { service, counters } = setup();

      const outcome = await service.consume(
        createExecutionContext({
          tier: 'anonymous',
          userId: 'anon-1',
          clientIp: '203.0.113.7',
        }),
        TURN
      );

      expect(counters.consume).toHaveBeenCalledWith(
        expect.objectContaining({ subjects: ['anon-1', IP_SUBJECT] }),
        5
      );
      expect(outcome).toMatchObject({
        kind: 'consumed',
        quota: {
          tier: 'anonymous',
          messages: { used: 1, limit: 5, resetsAt: RESETS_AT },
        },
      });
    });

    it('meters an anonymous caller without a client IP under its session alone', async () => {
      const { service, counters } = setup();

      await service.consume(
        createExecutionContext({ tier: 'anonymous', userId: 'anon-1' }),
        TURN
      );

      expect(counters.consume).toHaveBeenCalledWith(
        expect.objectContaining({ subjects: ['anon-1'] }),
        5
      );
    });

    it.each([
      { tier: 'anonymous', upgrade: 'register' },
      { tier: 'free', upgrade: 'byok' },
    ] as const)(
      'refuses an exhausted $tier caller with the next UTC midnight and the $upgrade upgrade',
      async ({ tier, upgrade }) => {
        const { service, events } = setup({
          counters: {
            consume: vi.fn().mockResolvedValue({ allowed: false, used: 5 }),
          },
        });

        const outcome = await service.consume(
          createExecutionContext({ tier }),
          TURN
        );

        expect(outcome).toEqual({
          kind: 'exhausted',
          resetsAt: new Date(RESETS_AT),
          upgrade,
        });
        expect(events.emit).toHaveBeenCalledWith(
          MessageQuotaExhaustedEvent.EVENT_NAME,
          expect.objectContaining({ userId: 'user-1', tier })
        );
      }
    );

    it('announces a fresh consumption with its raw counts', async () => {
      const { service, events } = setup({
        counters: {
          consume: vi
            .fn()
            .mockResolvedValue({ allowed: true, used: 25, replayed: false }),
        },
      });

      await service.consume(createExecutionContext({ tier: 'free' }), TURN);

      expect(events.emit).toHaveBeenCalledWith(
        MessageQuotaConsumedEvent.EVENT_NAME,
        expect.objectContaining({ tier: 'free', used: 25, limit: 30 })
      );
    });

    it('serves a replayed turn its current count without announcing it', async () => {
      const { service, events } = setup({
        counters: {
          consume: vi
            .fn()
            .mockResolvedValue({ allowed: true, used: 3, replayed: true }),
        },
      });

      const outcome = await service.consume(
        createExecutionContext({ tier: 'free' }),
        TURN
      );

      expect(outcome).toMatchObject({
        kind: 'consumed',
        receipt: { store: QUOTA_STORES.REDIS },
        quota: { messages: { used: 3 } },
      });
      expect(events.emit).not.toHaveBeenCalled();
    });

    it.each([
      {
        counted: { allowed: false, used: 30 },
        expected: { kind: 'exhausted' },
      },
      {
        counted: { allowed: true, used: 7, replayed: false },
        expected: { kind: 'consumed', receipt: { store: QUOTA_STORES.REDIS } },
      },
    ] as const)(
      'keeps the Redis verdict ($expected.kind) when announcing it throws, never asking Postgres',
      async ({ counted, expected }) => {
        const warn = vi
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined);
        const { service, persisted, events } = setup({
          counters: { consume: vi.fn().mockResolvedValue(counted) },
        });
        vi.mocked(events.emit).mockImplementation(() => {
          throw new Error('listener failed');
        });

        const outcome = await service.consume(
          createExecutionContext({ tier: 'free' }),
          TURN
        );

        expect(outcome).toMatchObject(expected);
        expect(persisted.countUserMessages).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(
          expect.objectContaining({ event: 'ai.quota.announce_failed' })
        );
      }
    );

    it.each([
      { persistedToday: 29, kind: 'consumed' },
      { persistedToday: 30, kind: 'exhausted' },
    ])(
      "falls back to today's persisted rows for a registered caller when the counters are down ($persistedToday → $kind)",
      async ({ persistedToday, kind }) => {
        const { service, persisted } = setup({
          counters: { consume: down() },
          persisted: {
            countUserMessages: vi.fn().mockResolvedValue(persistedToday),
          },
        });

        const outcome = await service.consume(
          createExecutionContext({ tier: 'free' }),
          TURN
        );

        expect(persisted.countUserMessages).toHaveBeenCalledWith(
          'user-1',
          expect.objectContaining({ key: '2026-09-27' })
        );
        expect(outcome.kind).toBe(kind);
      }
    );

    it('counts the fallback turn itself in its quota and its event', async () => {
      const { service, events } = setup({
        counters: { consume: down() },
        persisted: { countUserMessages: vi.fn().mockResolvedValue(29) },
      });

      const outcome = await service.consume(
        createExecutionContext({ tier: 'free' }),
        TURN
      );

      expect(outcome).toMatchObject({
        kind: 'consumed',
        receipt: { store: QUOTA_STORES.POSTGRES },
        quota: { messages: { used: 30, limit: 30 } },
      });
      expect(events.emit).toHaveBeenCalledWith(
        MessageQuotaConsumedEvent.EVENT_NAME,
        expect.objectContaining({ used: 30, limit: 30 })
      );
    });

    it('fails an anonymous caller closed when the counters are down', async () => {
      const { service, persisted } = setup({ counters: { consume: down() } });

      const outcome = await service.consume(
        createExecutionContext({ tier: 'anonymous', clientIp: '203.0.113.7' }),
        TURN
      );

      expect(outcome).toEqual({ kind: 'unavailable' });
      expect(persisted.countUserMessages).not.toHaveBeenCalled();
    });

    it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5])(
      'fails closed on a daily limit of %s without touching either store',
      async (limit) => {
        const warn = vi
          .spyOn(Logger.prototype, 'warn')
          .mockImplementation(() => undefined);
        const { service, counters, persisted } = setup({
          limits: { anonymous: limit, free: limit },
        });

        const outcome = await service.consume(
          createExecutionContext({ tier: 'free' }),
          TURN
        );

        expect(outcome).toEqual({ kind: 'unavailable' });
        expect(counters.consume).not.toHaveBeenCalled();
        expect(persisted.countUserMessages).not.toHaveBeenCalled();
        expect(warn).toHaveBeenCalledWith(
          expect.objectContaining({
            event: 'ai.quota.invalid_limit',
            tier: 'free',
            limit: String(limit),
          })
        );
      }
    );

    it('meters a guest against a daily limit of 0, refusing the turn as exhausted', async () => {
      const { service, counters } = setup({
        limits: { anonymous: 0, free: 30 },
        counters: {
          consume: vi.fn().mockResolvedValue({ allowed: false, used: 0 }),
        },
      });

      const outcome = await service.consume(
        createExecutionContext({ tier: 'anonymous' }),
        TURN
      );

      expect(counters.consume).toHaveBeenCalledWith(expect.anything(), 0);
      expect(outcome).toMatchObject({ kind: 'exhausted', upgrade: 'register' });
    });

    it('fails closed when both stores are down', async () => {
      const { service } = setup({
        counters: { consume: down() },
        persisted: { countUserMessages: down() },
      });

      await expect(
        service.consume(createExecutionContext({ tier: 'free' }), TURN)
      ).resolves.toEqual({ kind: 'unavailable' });
    });
  });

  describe('refund', () => {
    it('returns the message and reports the quota after it', async () => {
      const { service, counters } = setup({
        counters: { usage: vi.fn().mockResolvedValue(4) },
      });
      const receipt = await receiptFrom(service);

      await expect(service.refund(receipt)).resolves.toEqual({
        tier: 'free',
        messages: { used: 4, limit: 30, resetsAt: RESETS_AT },
      });
      expect(counters.refund).toHaveBeenCalledWith(receipt.turn);
    });

    it('reports nothing when the turn held no marker', async () => {
      const { service, counters } = setup({
        counters: { refund: vi.fn().mockResolvedValue(false) },
      });

      await expect(
        service.refund(await receiptFrom(service))
      ).resolves.toBeNull();
      expect(counters.usage).not.toHaveBeenCalled();
    });

    it('never rejects when the counters fail mid-refund', async () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const { service } = setup({ counters: { refund: down() } });

      await expect(
        service.refund(await receiptFrom(service))
      ).resolves.toBeNull();
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'ai.quota.refund_failed' })
      );
    });

    it('reports nothing, under its own event, when the refund lands but the quota after it cannot be read', async () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const { service, counters } = setup({ counters: { usage: down() } });
      const receipt = await receiptFrom(service);

      await expect(service.refund(receipt)).resolves.toBeNull();
      expect(counters.refund).toHaveBeenCalledWith(receipt.turn);
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'ai.quota.refund_report_failed' })
      );
      expect(warn).not.toHaveBeenCalledWith(
        expect.objectContaining({ event: 'ai.quota.refund_failed' })
      );
    });

    it("refunds the day a midnight-crossing turn consumed and reports today's quota", async () => {
      vi.setSystemTime(new Date('2026-09-27T23:59:59.000Z'));
      const { service, counters } = setup({
        counters: { usage: vi.fn().mockResolvedValue(0) },
      });
      const receipt = await receiptFrom(service);
      vi.setSystemTime(new Date('2026-09-28T00:00:01.000Z'));

      const quota = await service.refund(receipt);

      expect(counters.refund).toHaveBeenCalledWith(
        expect.objectContaining({
          day: expect.objectContaining({ key: '2026-09-27' }),
        })
      );
      expect(counters.usage).toHaveBeenCalledWith(
        receipt.turn.subjects,
        expect.objectContaining({ key: '2026-09-28' })
      );
      expect(quota).toEqual({
        tier: 'free',
        messages: { used: 0, limit: 30, resetsAt: '2026-09-29T00:00:00.000Z' },
      });
    });

    it('has nothing to return for a turn the fallback counted', async () => {
      const { service, counters } = setup({ counters: { consume: down() } });
      const receipt = await receiptFrom(service);

      await expect(service.refund(receipt)).resolves.toBeNull();
      expect(counters.refund).not.toHaveBeenCalled();
    });
  });

  describe('snapshot', () => {
    it.each([
      {
        tier: 'anonymous',
        messages: { used: 3, limit: 5, resetsAt: RESETS_AT },
      },
      { tier: 'free', messages: { used: 3, limit: 30, resetsAt: RESETS_AT } },
      { tier: 'byok', messages: null },
    ] as const)('reports a $tier caller', async ({ tier, messages }) => {
      const { service } = setup({
        counters: { usage: vi.fn().mockResolvedValue(3) },
      });

      await expect(
        service.snapshot(
          createExecutionContext({ tier, clientIp: '203.0.113.7' })
        )
      ).resolves.toEqual({ tier, messages });
    });

    it('reads an anonymous caller under its session and its IP together', async () => {
      const { service, counters } = setup();

      await service.snapshot(
        createExecutionContext({ tier: 'anonymous', clientIp: '203.0.113.7' })
      );

      expect(counters.usage).toHaveBeenCalledWith(
        ['user-1', IP_SUBJECT],
        expect.objectContaining({ key: '2026-09-27' })
      );
    });

    it('reads a registered caller from Postgres when the counters are down', async () => {
      const warn = vi
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      const { service } = setup({
        counters: { usage: down() },
        persisted: { countUserMessages: vi.fn().mockResolvedValue(7) },
      });

      await expect(
        service.snapshot(createExecutionContext({ tier: 'free' }))
      ).resolves.toMatchObject({ messages: { used: 7, limit: 30 } });
      expect(warn).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'ai.quota.counters_unavailable',
          tier: 'free',
        })
      );
    });

    it('refuses to guess a registered snapshot when both stores are down', async () => {
      const { service } = setup({
        counters: { usage: down() },
        persisted: { countUserMessages: down() },
      });

      const snapshot = service.snapshot(
        createExecutionContext({ tier: 'free' })
      );

      await expect(snapshot).rejects.toBeInstanceOf(AiUnavailableError);
      await expect(snapshot).rejects.toMatchObject({ dependency: 'quota' });
    });

    it('refuses to guess an anonymous snapshot when the counters are down', async () => {
      const { service } = setup({ counters: { usage: down() } });

      await expect(
        service.snapshot(createExecutionContext({ tier: 'anonymous' }))
      ).rejects.toMatchObject({ dependency: 'quota' });
      await expect(
        service.snapshot(createExecutionContext({ tier: 'anonymous' }))
      ).rejects.toBeInstanceOf(AiUnavailableError);
    });
  });
});
