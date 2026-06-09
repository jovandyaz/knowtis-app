import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../config/env.config';
import type { AIConfigService } from '../../ai/application/services/ai-config.service';
import type { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import type { AgentEvent } from '../domain/agent-event';
import type { AgentOrchestrator } from '../domain/ports/agent-orchestrator.port';
import type { PendingMutationStore } from '../domain/ports/pending-mutation.store';
import { ProposedMutation } from '../domain/proposed-mutation';
import { RunAgentTurnHandler } from './run-agent-turn.handler';

function makeProposal(id: string): ProposedMutation {
  const r = ProposedMutation.create({
    id,
    kind: 'create',
    payload: { title: 'GTD', contentHtml: '<p>x</p>' },
    summary: 'Create GTD',
  });
  if (r.isErr()) {
    throw new Error('proposal setup failed');
  }
  return r.value;
}

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
        knownNotes: [],
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
        knownNotes: [],
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
        knownNotes: [],
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

  it('threads knownNotes to the orchestrator and forwards them from done', async () => {
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
        knownNotes: [{ id: 'n1', title: 'GTD' }],
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
      {
        userId: USER,
        messages: [{ role: 'user', content: 'hi' }],
        knownNotes: [{ id: 'prev', title: 'Earlier' }],
      },
      { onChunk: vi.fn(), onDone: done, onError: vi.fn(), onProposal: vi.fn() }
    );

    expect(orchestrator.run).toHaveBeenCalledWith(
      expect.objectContaining({
        knownNotes: [{ id: 'prev', title: 'Earlier' }],
      })
    );
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ knownNotes: [{ id: 'n1', title: 'GTD' }] })
    );
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
        knownNotes: [],
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

  it('records usage, persists the proposal, and calls onProposal on a proposal event', async () => {
    const { rateLimit, aiConfig, config, pendingStore } = makeDeps({});
    const proposal = makeProposal('22222222-2222-2222-2222-222222222222');
    const orchestrator = orchestratorYielding([
      {
        type: 'proposal',
        proposal,
        usage: {
          inputTokens: 7,
          outputTokens: 3,
          model: 'anthropic:claude-sonnet-4-20250514',
        },
      },
    ]);
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      aiConfig,
      config,
      pendingStore
    );
    const onProposal = vi.fn();

    await handler.execute(
      { userId: USER, messages: [{ role: 'user', content: 'create a note' }] },
      { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn(), onProposal }
    );

    expect(rateLimit.recordUsage).toHaveBeenCalledOnce();
    expect(pendingStore.save).toHaveBeenCalledWith(
      expect.objectContaining({ userId: USER, toolName: 'proposeCreateNote' })
    );
    expect(onProposal).toHaveBeenCalledWith(proposal);
  });

  it('resumeTurn streams the acknowledgment and records usage on done', async () => {
    const { rateLimit, aiConfig, config, pendingStore } = makeDeps({});
    const orchestrator = orchestratorYielding([
      { type: 'chunk', text: 'Done' },
      {
        type: 'done',
        usage: {
          inputTokens: 2,
          outputTokens: 1,
          model: 'anthropic:claude-sonnet-4-20250514',
        },
        sources: [],
        knownNotes: [],
      },
    ]);
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      aiConfig,
      config,
      pendingStore
    );
    const onDone = vi.fn();

    await handler.resumeTurn(
      {
        userId: USER,
        messages: [{ role: 'user', content: 'ok' }],
        resume: { toolName: 'proposeCreateNote', outcome: 'created' },
      },
      { onChunk: vi.fn(), onDone, onError: vi.fn() }
    );

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 2, outputTokens: 1 })
    );
    expect(rateLimit.recordUsage).toHaveBeenCalledOnce();
  });

  it('resumeTurn denies and never calls the orchestrator when rate-limited', async () => {
    const { rateLimit, aiConfig, config, orchestrator, pendingStore } =
      makeDeps({ allowed: false });
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      aiConfig,
      config,
      pendingStore
    );
    const onError = vi.fn();

    await handler.resumeTurn(
      {
        userId: USER,
        messages: [{ role: 'user', content: 'ok' }],
        resume: { toolName: 'proposeCreateNote', outcome: 'created' },
      },
      { onChunk: vi.fn(), onDone: vi.fn(), onError }
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AI_RATE_LIMIT_EXCEEDED' })
    );
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it('resumeTurn ends the turn via onDone when the orchestrator unexpectedly yields a proposal', async () => {
    const { rateLimit, aiConfig, config, pendingStore } = makeDeps({});
    const orchestrator = orchestratorYielding([
      {
        type: 'proposal',
        proposal: makeProposal('33333333-3333-3333-3333-333333333333'),
        usage: {
          inputTokens: 1,
          outputTokens: 1,
          model: 'anthropic:claude-sonnet-4-20250514',
        },
      },
    ]);
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      aiConfig,
      config,
      pendingStore
    );
    const onDone = vi.fn();

    await handler.resumeTurn(
      {
        userId: USER,
        messages: [{ role: 'user', content: 'ok' }],
        resume: { toolName: 'proposeCreateNote', outcome: 'created' },
      },
      { onChunk: vi.fn(), onDone, onError: vi.fn() }
    );

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ costUsd: 0 })
    );
  });

  it('resumeTurn calls onError when the orchestrator throws', async () => {
    const { rateLimit, aiConfig, config, pendingStore } = makeDeps({});
    const throwingOrchestrator: AgentOrchestrator = {
      run: vi.fn(async function* () {
        throw new Error('resume failed');
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

    await handler.resumeTurn(
      {
        userId: USER,
        messages: [{ role: 'user', content: 'ok' }],
        resume: { toolName: 'proposeCreateNote', outcome: 'created' },
      },
      { onChunk: vi.fn(), onDone: vi.fn(), onError }
    );

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AI_PROVIDER_ERROR' })
    );
  });

  it('resumeTurn returns immediately when signal is pre-aborted', async () => {
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
    const onDone = vi.fn();
    const onError = vi.fn();

    await handler.resumeTurn(
      {
        userId: USER,
        messages: [{ role: 'user', content: 'ok' }],
        resume: { toolName: 'proposeCreateNote', outcome: 'created' },
      },
      { onChunk: vi.fn(), onDone, onError },
      controller.signal
    );

    expect(orchestrator.run).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });
});
