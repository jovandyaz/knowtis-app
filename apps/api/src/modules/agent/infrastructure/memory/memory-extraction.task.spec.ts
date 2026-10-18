import { Logger } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAdvisoryLockClient } from '../../../../test-support/advisory-lock';
import { MemoryExtractionTask } from './memory-extraction.task';

const FAST_MODEL = 'openrouter:fast';
const QUIET_SECONDS = 180;
const BATCH_SIZE = 20;
const MAX_EXTRACTION_ATTEMPTS = 3;
const BACKOFF_BASE_SECONDS = 1800;
const TICKS_PAST_THE_CAP = MAX_EXTRACTION_ATTEMPTS + 2;
const C1 = {
  id: 'c1',
  userId: 'u1',
  version: '2026-10-03 10:00:00.123456+00',
  attempts: 0,
};
const C2 = {
  id: 'c2',
  userId: 'u2',
  version: '2026-10-03 10:05:00.654321+00',
  attempts: 0,
};

function make(opts: { embedConfigured?: boolean; lock?: boolean } = {}) {
  const embedConfigured = opts.embedConfigured ?? true;
  const lock = opts.lock ?? true;
  const { client } = createAdvisoryLockClient(lock);
  const config = {
    get: (k: string) =>
      (
        ({
          AI_MEMORY_QUIET_SECONDS: QUIET_SECONDS,
          AI_MEMORY_BATCH_SIZE: BATCH_SIZE,
        }) as Record<string, unknown>
      )[k],
  };
  const aiConfig = { getFastModel: vi.fn().mockResolvedValue(FAST_MODEL) };
  const conversations = {
    findExtractable: vi.fn().mockResolvedValue([C1]),
    recordExtractionFailure: vi.fn().mockResolvedValue(1),
  };
  const embed = {
    isConfigured: vi.fn().mockReturnValue(embedConfigured),
  };
  const rateLimit = {
    isGlobalSpendExhausted: vi.fn().mockResolvedValue(false),
  };
  const extractMemories = {
    execute: vi.fn().mockResolvedValue({
      tainted: false,
      taintReasons: [],
      reconcile: null,
    }),
  };
  const task = new MemoryExtractionTask(
    client,
    config as never,
    aiConfig as never,
    conversations as never,
    embed as never,
    rateLimit as never,
    extractMemories as never
  );
  return { task, aiConfig, conversations, rateLimit, extractMemories };
}

describe('MemoryExtractionTask', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('extracts each due conversation with the fast model', async () => {
    const { task, conversations, extractMemories } = make();
    conversations.findExtractable.mockResolvedValue([C1, C2]);

    await task.reconcile();

    expect(extractMemories.execute).toHaveBeenNthCalledWith(1, {
      conversation: C1,
      model: FAST_MODEL,
      finalAttempt: false,
    });
    expect(extractMemories.execute).toHaveBeenNthCalledWith(2, {
      conversation: C2,
      model: FAST_MODEL,
      finalAttempt: false,
    });
  });

  it.each([
    [0, false],
    [MAX_EXTRACTION_ATTEMPTS - 2, false],
    [MAX_EXTRACTION_ATTEMPTS - 1, true],
  ])(
    'tells the handler whether a state that already failed %i times is on its final attempt',
    async (attempts, finalAttempt) => {
      const { task, conversations, extractMemories } = make();
      conversations.findExtractable.mockResolvedValue([{ ...C1, attempts }]);

      await task.reconcile();

      expect(extractMemories.execute).toHaveBeenCalledWith({
        conversation: { ...C1, attempts },
        model: FAST_MODEL,
        finalAttempt,
      });
    }
  );

  it('asks only for conversations the retry policy still allows', async () => {
    const { task, conversations } = make();

    await task.reconcile();

    expect(conversations.findExtractable).toHaveBeenCalledWith(
      QUIET_SECONDS,
      BATCH_SIZE,
      {
        maxAttempts: MAX_EXTRACTION_ATTEMPTS,
        backoffBaseSeconds: BACKOFF_BASE_SECONDS,
      }
    );
  });

  it('skips the run while global spend is exhausted, extracting nothing', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const debug = vi
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    const { task, rateLimit, conversations, extractMemories } = make();
    rateLimit.isGlobalSpendExhausted.mockResolvedValue(true);

    await task.reconcile();

    expect(debug).toHaveBeenCalledWith({
      event: 'agent.memory.extraction_skipped',
      reason: 'global_breaker',
    });
    expect(warn).not.toHaveBeenCalled();
    expect(conversations.findExtractable).not.toHaveBeenCalled();
    expect(extractMemories.execute).not.toHaveBeenCalled();
  });

  it('stops the batch once an extraction exhausts global spend, leaving the rest unextracted', async () => {
    const debug = vi
      .spyOn(Logger.prototype, 'debug')
      .mockImplementation(() => undefined);
    const { task, rateLimit, conversations, extractMemories } = make();
    conversations.findExtractable.mockResolvedValue([C1, C2]);
    rateLimit.isGlobalSpendExhausted.mockImplementation(
      async () => extractMemories.execute.mock.calls.length > 0
    );

    await task.reconcile();

    expect(extractMemories.execute).toHaveBeenCalledTimes(1);
    expect(extractMemories.execute).toHaveBeenCalledWith({
      conversation: C1,
      model: FAST_MODEL,
      finalAttempt: false,
    });
    expect(debug).toHaveBeenCalledWith({
      event: 'agent.memory.extraction_skipped',
      reason: 'global_breaker',
    });
  });

  it('counts a failed extraction against the state it read', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { task, extractMemories, conversations } = make();
    extractMemories.execute.mockRejectedValue(new Error('db down'));

    await task.reconcile();

    expect(conversations.recordExtractionFailure).toHaveBeenCalledWith(
      'u1',
      'c1',
      C1.version
    );
  });

  it('counts a failure to resolve the fast model like any other failure of the conversation', async () => {
    vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { task, aiConfig, extractMemories, conversations } = make();
    aiConfig.getFastModel.mockRejectedValue(new Error('config down'));

    await task.reconcile();

    expect(extractMemories.execute).not.toHaveBeenCalled();
    expect(conversations.recordExtractionFailure).toHaveBeenCalledWith(
      'u1',
      'c1',
      C1.version
    );
  });

  it('extracts a conversation whose extraction keeps failing once per attempt, then gives it up', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { task, extractMemories, conversations } = make();
    let failures = 0;
    conversations.findExtractable.mockImplementation(
      async (_quiet: number, _limit: number, retry: { maxAttempts: number }) =>
        failures < retry.maxAttempts ? [C1] : []
    );
    conversations.recordExtractionFailure.mockImplementation(
      async () => ++failures
    );
    extractMemories.execute.mockRejectedValue(new Error('voyage down'));

    for (let tick = 0; tick < TICKS_PAST_THE_CAP; tick++) {
      await task.reconcile();
    }

    expect(extractMemories.execute).toHaveBeenCalledTimes(
      MAX_EXTRACTION_ATTEMPTS
    );
    expect(warn).toHaveBeenCalledTimes(MAX_EXTRACTION_ATTEMPTS);
    expect(warn).toHaveBeenLastCalledWith(
      expect.objectContaining({
        event: 'agent.memory.extraction_abandoned',
        conversationId: 'c1',
        attempts: MAX_EXTRACTION_ATTEMPTS,
        reason: 'voyage down',
      })
    );
  });

  it('logs a failure below the attempt cap as one to retry, not as abandoned', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { task, extractMemories, conversations } = make();
    extractMemories.execute.mockRejectedValue(new Error('provider down'));
    conversations.recordExtractionFailure.mockResolvedValue(1);

    await task.reconcile();

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'agent.memory.extraction_failed',
        conversationId: 'c1',
        attempts: 1,
        reason: 'provider down',
      })
    );
    expect(warn).not.toHaveBeenCalledWith(
      expect.objectContaining({ event: 'agent.memory.extraction_abandoned' })
    );
  });

  it('gives a conversation up when its failure reaches the attempt cap', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { task, extractMemories, conversations } = make();
    extractMemories.execute.mockRejectedValue(new Error('provider down'));
    conversations.recordExtractionFailure.mockResolvedValue(
      MAX_EXTRACTION_ATTEMPTS
    );

    await task.reconcile();

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'agent.memory.extraction_abandoned',
        conversationId: 'c1',
        attempts: MAX_EXTRACTION_ATTEMPTS,
        reason: 'provider down',
      })
    );
  });

  it('keeps going through the batch when a failure cannot be counted', async () => {
    const warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    const { task, extractMemories, conversations } = make();
    conversations.findExtractable.mockResolvedValue([C1, C2]);
    extractMemories.execute.mockRejectedValueOnce(new Error('provider down'));
    conversations.recordExtractionFailure.mockRejectedValue(
      new Error('db down')
    );

    await task.reconcile();

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'agent.memory.extraction_failure_unrecorded',
        conversationId: 'c1',
        reason: 'db down',
      })
    );
    expect(extractMemories.execute).toHaveBeenCalledWith({
      conversation: C2,
      model: FAST_MODEL,
      finalAttempt: false,
    });
  });

  it('does nothing when embeddings are not configured', async () => {
    const { task, conversations } = make({ embedConfigured: false });

    await task.reconcile();

    expect(conversations.findExtractable).not.toHaveBeenCalled();
  });

  it('does nothing when the advisory lock is already held', async () => {
    const { task, conversations } = make({ lock: false });

    await task.reconcile();

    expect(conversations.findExtractable).not.toHaveBeenCalled();
  });
});
