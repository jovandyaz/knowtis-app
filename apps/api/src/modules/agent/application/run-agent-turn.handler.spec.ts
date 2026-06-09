import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../config/env.config';
import type { AIConfigService } from '../../ai/application/services/ai-config.service';
import type { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import type { AgentEvent } from '../domain/agent-event';
import type { AgentOrchestrator } from '../domain/ports/agent-orchestrator.port';
import type { PendingMutationStore } from '../domain/ports/pending-mutation.store';
import { RunAgentTurnHandler } from './run-agent-turn.handler';

const USER = '11111111-1111-1111-1111-111111111111';

function orchestratorYielding(events: AgentEvent[]): AgentOrchestrator {
  return {
    run: vi.fn(async function* () {
      for (const e of events) {
        yield e;
      }
    }),
  };
}

function makeDeps(over: { allowed?: boolean; events?: AgentEvent[] }) {
  const rateLimit = {
    checkLimit: vi.fn().mockResolvedValue({ allowed: over.allowed ?? true }),
    recordUsage: vi.fn().mockResolvedValue(undefined),
  } as unknown as AIRateLimitService;
  const aiConfig = {
    getDefaultModel: vi
      .fn()
      .mockResolvedValue('anthropic:claude-sonnet-4-20250514'),
  } as unknown as AIConfigService;
  const config = {
    get: vi.fn((k: string) =>
      k === 'AI_AGENT_MAX_STEPS' ? 8 : k === 'AI_AGENT_MAX_MS' ? 120000 : 0
    ),
  } as unknown as ConfigService<EnvConfig, true>;
  const orchestrator = orchestratorYielding(
    over.events ?? [
      { type: 'chunk', text: 'Hi' },
      {
        type: 'done',
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          model: 'anthropic:claude-sonnet-4-20250514',
        },
        sources: [],
      },
    ]
  );
  const pendingStore = {
    save: vi.fn().mockResolvedValue(undefined),
    take: vi.fn().mockResolvedValue(null),
  } as unknown as PendingMutationStore;
  return { rateLimit, aiConfig, config, orchestrator, pendingStore };
}

describe('RunAgentTurnHandler', () => {
  it('streams chunks then done, and records usage', async () => {
    const { rateLimit, aiConfig, config, orchestrator, pendingStore } =
      makeDeps({});
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      aiConfig,
      config,
      pendingStore
    );
    const chunks: string[] = [];
    const done = vi.fn();
    const error = vi.fn();

    await handler.execute(
      { userId: USER, messages: [{ role: 'user', content: 'hi' }] },
      {
        onChunk: (t) => chunks.push(t),
        onDone: done,
        onError: error,
        onProposal: vi.fn(),
      }
    );

    expect(chunks).toEqual(['Hi']);
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 10, outputTokens: 5 })
    );
    expect(error).not.toHaveBeenCalled();
    expect(rateLimit.recordUsage).toHaveBeenCalledOnce();
  });

  it('denies and never calls the orchestrator when rate-limited', async () => {
    const { rateLimit, aiConfig, config, orchestrator, pendingStore } =
      makeDeps({
        allowed: false,
      });
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      aiConfig,
      config,
      pendingStore
    );
    const error = vi.fn();

    await handler.execute(
      { userId: USER, messages: [{ role: 'user', content: 'hi' }] },
      { onChunk: vi.fn(), onDone: vi.fn(), onError: error, onProposal: vi.fn() }
    );

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AI_RATE_LIMIT_EXCEEDED' })
    );
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it('forwards an orchestrator error event to onError', async () => {
    const { rateLimit, aiConfig, config, pendingStore } = makeDeps({});
    const orchestrator = orchestratorYielding([
      { type: 'error', error: { code: 'AI_PROVIDER_ERROR', message: 'boom' } },
    ]);
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      aiConfig,
      config,
      pendingStore
    );
    const error = vi.fn();

    await handler.execute(
      { userId: USER, messages: [{ role: 'user', content: 'hi' }] },
      { onChunk: vi.fn(), onDone: vi.fn(), onError: error, onProposal: vi.fn() }
    );

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AI_PROVIDER_ERROR' })
    );
  });

  it('forwards sources on done', async () => {
    const { rateLimit, aiConfig, config, pendingStore } = makeDeps({});
    const orchestrator = orchestratorYielding([
      {
        type: 'done',
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          model: 'anthropic:claude-sonnet-4-20250514',
        },
        sources: [{ id: 'n1', title: 'Productividad' }],
      },
    ]);
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      aiConfig,
      config,
      pendingStore
    );
    const done = vi.fn();

    await handler.execute(
      { userId: USER, messages: [{ role: 'user', content: 'hi' }] },
      { onChunk: vi.fn(), onDone: done, onError: vi.fn(), onProposal: vi.fn() }
    );

    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [{ id: 'n1', title: 'Productividad' }],
      })
    );
  });

  it('forwards empty sources array on done', async () => {
    const { rateLimit, aiConfig, config, pendingStore } = makeDeps({});
    const orchestrator = orchestratorYielding([
      {
        type: 'done',
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          model: 'anthropic:claude-sonnet-4-20250514',
        },
        sources: [],
      },
    ]);
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      aiConfig,
      config,
      pendingStore
    );
    const done = vi.fn();

    await handler.execute(
      { userId: USER, messages: [{ role: 'user', content: 'hi' }] },
      { onChunk: vi.fn(), onDone: done, onError: vi.fn(), onProposal: vi.fn() }
    );

    expect(done).toHaveBeenCalledWith(expect.objectContaining({ sources: [] }));
  });

  it('calls onError and does not record usage when orchestrator throws synchronously', async () => {
    const { rateLimit, aiConfig, config, pendingStore } = makeDeps({});
    const throwingOrchestrator: AgentOrchestrator = {
      run: vi.fn(async function* () {
        throw new Error('orchestrator failed');
        // TypeScript needs a yield to infer AsyncGenerator; unreachable:
        yield { type: 'chunk', text: '' } as AgentEvent;
      }),
    };
    const handler = new RunAgentTurnHandler(
      throwingOrchestrator,
      rateLimit,
      aiConfig,
      config,
      pendingStore
    );
    const onError = vi.fn();

    await handler.execute(
      { userId: USER, messages: [{ role: 'user', content: 'hi' }] },
      { onChunk: vi.fn(), onDone: vi.fn(), onError, onProposal: vi.fn() }
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AI_PROVIDER_ERROR' })
    );
    expect(rateLimit.recordUsage).not.toHaveBeenCalled();
  });

  it('calls onDone with usage and never calls onChunk when orchestrator yields only done', async () => {
    const { rateLimit, aiConfig, config, pendingStore } = makeDeps({});
    const orchestrator = orchestratorYielding([
      {
        type: 'done',
        usage: {
          inputTokens: 4,
          outputTokens: 2,
          model: 'anthropic:claude-sonnet-4-20250514',
        },
        sources: [],
      },
    ]);
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      aiConfig,
      config,
      pendingStore
    );
    const onChunk = vi.fn();
    const onDone = vi.fn();

    await handler.execute(
      { userId: USER, messages: [{ role: 'user', content: 'hi' }] },
      { onChunk, onDone, onError: vi.fn(), onProposal: vi.fn() }
    );

    expect(onChunk).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 4, outputTokens: 2 })
    );
  });

  it('returns immediately without calling orchestrator when signal is pre-aborted', async () => {
    const { rateLimit, aiConfig, config, orchestrator, pendingStore } =
      makeDeps({});
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      aiConfig,
      config,
      pendingStore
    );
    const controller = new AbortController();
    controller.abort();
    const onChunk = vi.fn();
    const onDone = vi.fn();
    const onError = vi.fn();

    await handler.execute(
      { userId: USER, messages: [{ role: 'user', content: 'hi' }] },
      { onChunk, onDone, onError, onProposal: vi.fn() },
      controller.signal
    );

    expect(orchestrator.run).not.toHaveBeenCalled();
    expect(onChunk).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it('calls onError with providerError when onChunk throws inside the for-await loop', async () => {
    const { rateLimit, aiConfig, config, pendingStore } = makeDeps({});
    const orchestrator = orchestratorYielding([
      { type: 'chunk', text: 'boom' },
    ]);
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      aiConfig,
      config,
      pendingStore
    );
    const onError = vi.fn();

    await handler.execute(
      { userId: USER, messages: [{ role: 'user', content: 'hi' }] },
      {
        onChunk: () => {
          throw new Error('chunk handler failed');
        },
        onDone: vi.fn(),
        onError,
        onProposal: vi.fn(),
      }
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AI_PROVIDER_ERROR' })
    );
  });
});
