import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../../config/env.config';
import { AgentToolsFactory } from './agent-tools.factory';
import { AiSdkAgentOrchestrator } from './ai-sdk-agent.orchestrator';

function collect(iter: AsyncIterable<unknown>) {
  return (async () => {
    const out = [] as unknown[];
    for await (const e of iter) {
      out.push(e);
    }
    return out;
  })();
}

describe('AiSdkAgentOrchestrator', () => {
  it('yields a single error event (and does not throw) when the model is invalid', async () => {
    const config = {
      get: vi.fn((k: string) =>
        k === 'GOOGLE_GENERATIVE_AI_API_KEY' || k === 'OPENAI_API_KEY'
          ? ''
          : undefined
      ),
    } as unknown as ConfigService<EnvConfig, true>;
    const tools = {
      build: vi.fn().mockReturnValue({}),
    } as unknown as AgentToolsFactory;

    const orchestrator = new AiSdkAgentOrchestrator(config, tools);
    orchestrator.onModuleInit();

    const events = await collect(
      orchestrator.run({
        userId: 'u1',
        messages: [{ role: 'user', content: 'hi' }],
        model: 'nonexistent:model',
        maxSteps: 4,
      })
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error' });
  });
});
