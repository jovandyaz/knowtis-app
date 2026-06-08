import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../config/env.config';
import type { AIConfigService } from '../../ai/application/services/ai-config.service';
import type { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import type { AgentEvent } from '../domain/agent-event';
import type { AgentOrchestrator } from '../domain/ports/agent-orchestrator.port';
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
      },
    ]
  );
  return { rateLimit, aiConfig, config, orchestrator };
}

describe('RunAgentTurnHandler', () => {
  it('streams chunks then done, and records usage', async () => {
    const { rateLimit, aiConfig, config, orchestrator } = makeDeps({});
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      aiConfig,
      config
    );
    const chunks: string[] = [];
    const done = vi.fn();
    const error = vi.fn();

    await handler.execute(
      { userId: USER, messages: [{ role: 'user', content: 'hi' }] },
      { onChunk: (t) => chunks.push(t), onDone: done, onError: error }
    );

    expect(chunks).toEqual(['Hi']);
    expect(done).toHaveBeenCalledWith(
      expect.objectContaining({ inputTokens: 10, outputTokens: 5 })
    );
    expect(error).not.toHaveBeenCalled();
    expect(rateLimit.recordUsage).toHaveBeenCalledOnce();
  });

  it('denies and never calls the orchestrator when rate-limited', async () => {
    const { rateLimit, aiConfig, config, orchestrator } = makeDeps({
      allowed: false,
    });
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      aiConfig,
      config
    );
    const error = vi.fn();

    await handler.execute(
      { userId: USER, messages: [{ role: 'user', content: 'hi' }] },
      { onChunk: vi.fn(), onDone: vi.fn(), onError: error }
    );

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AI_RATE_LIMIT_EXCEEDED' })
    );
    expect(orchestrator.run).not.toHaveBeenCalled();
  });

  it('forwards an orchestrator error event to onError', async () => {
    const { rateLimit, aiConfig, config } = makeDeps({});
    const orchestrator = orchestratorYielding([
      { type: 'error', error: { code: 'AI_PROVIDER_ERROR', message: 'boom' } },
    ]);
    const handler = new RunAgentTurnHandler(
      orchestrator,
      rateLimit,
      aiConfig,
      config
    );
    const error = vi.fn();

    await handler.execute(
      { userId: USER, messages: [{ role: 'user', content: 'hi' }] },
      { onChunk: vi.fn(), onDone: vi.fn(), onError: error }
    );

    expect(error).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'AI_PROVIDER_ERROR' })
    );
  });
});
