import { ConfigService } from '@nestjs/config';
import { describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../../config/env.config';
import { AgentToolsFactory } from './agent-tools.factory';
import { AiSdkAgentOrchestrator } from './ai-sdk-agent.orchestrator';

vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal<typeof import('ai')>();
  return {
    ...actual,
    stepCountIs: vi.fn(() => 'stop'),
    streamText: vi.fn(
      (opts: {
        onStepFinish?: (s: {
          toolResults: { toolName: string; output: unknown }[];
        }) => void;
      }) => {
        opts.onStepFinish?.({
          toolResults: [
            {
              toolName: 'getNote',
              output: { id: 'n1', title: 'Productividad', content: 'gtd' },
            },
            {
              toolName: 'getNote',
              output: { id: 'n1', title: 'Productividad', content: 'gtd' },
            },
            {
              toolName: 'searchNotes',
              output: [{ id: 'sx', title: 'ignored' }],
            },
            {
              toolName: 'getNote',
              output: { error: 'Note not found or not accessible.' },
            },
          ],
        });
        return {
          textStream: (async function* () {
            yield 'Hello';
          })(),
          totalUsage: Promise.resolve({ inputTokens: 3, outputTokens: 2 }),
        };
      }
    ),
  };
});

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
  it('collects deduped getNote sources and emits them on done', async () => {
    const config = { get: vi.fn(() => '') } as unknown as ConfigService<
      EnvConfig,
      true
    >;
    const tools = {
      build: vi.fn().mockReturnValue({}),
    } as unknown as AgentToolsFactory;

    const orchestrator = new AiSdkAgentOrchestrator(config, tools);
    orchestrator.onModuleInit();

    const events = await collect(
      orchestrator.run({
        userId: 'u1',
        messages: [{ role: 'user', content: 'hi' }],
        model: 'anthropic:claude-sonnet-4-20250514',
        maxSteps: 4,
      })
    );

    const done = events.find(
      (e): e is { type: 'done'; sources: { id: string; title: string }[] } =>
        (e as { type: string }).type === 'done'
    );
    expect(done).toBeDefined();
    expect(done?.sources).toEqual([{ id: 'n1', title: 'Productividad' }]);
  });

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
