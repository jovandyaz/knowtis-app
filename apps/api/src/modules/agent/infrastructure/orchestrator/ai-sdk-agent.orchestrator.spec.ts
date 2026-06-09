import { ConfigService } from '@nestjs/config';
import { streamText } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../../config/env.config';
import { ProposedMutation } from '../../domain/proposed-mutation';
import { AgentToolsFactory } from './agent-tools.factory';
import {
  AiSdkAgentOrchestrator,
  extractProposal,
} from './ai-sdk-agent.orchestrator';

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

  it('injects current-note context into the system prompt when noteId is given', async () => {
    const config = {
      get: vi.fn(() => ''),
    } as unknown as ConfigService<EnvConfig, true>;
    const tools = {
      build: vi.fn().mockReturnValue({}),
    } as unknown as AgentToolsFactory;

    const orchestrator = new AiSdkAgentOrchestrator(config, tools);
    orchestrator.onModuleInit();

    await collect(
      orchestrator.run({
        userId: 'u1',
        messages: [{ role: 'user', content: 'resume esta nota' }],
        model: 'anthropic:claude-sonnet-4-20250514',
        maxSteps: 4,
        noteId: 'note-xyz',
      })
    );

    const system = vi.mocked(streamText).mock.calls.at(-1)?.[0].system;
    expect(system).toContain('note-xyz');
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

  it('yields a chunk then a done event with correct usage and model on the happy path', async () => {
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

    const chunk = events.find((e) => (e as { type: string }).type === 'chunk');
    const done = events.find(
      (
        e
      ): e is {
        type: 'done';
        usage: { inputTokens: number; outputTokens: number; model: string };
        sources: unknown[];
      } => (e as { type: string }).type === 'done'
    );

    expect(chunk).toMatchObject({ type: 'chunk', text: 'Hello' });
    expect(done).toBeDefined();
    expect(done?.usage.inputTokens).toBe(3);
    expect(done?.usage.outputTokens).toBe(2);
    expect(done?.usage.model).toBe('anthropic:claude-sonnet-4-20250514');
  });

  it('passes the userId to toolsFactory.build', async () => {
    const config = { get: vi.fn(() => '') } as unknown as ConfigService<
      EnvConfig,
      true
    >;
    const tools = {
      build: vi.fn().mockReturnValue({}),
    } as unknown as AgentToolsFactory;

    const orchestrator = new AiSdkAgentOrchestrator(config, tools);
    orchestrator.onModuleInit();

    await collect(
      orchestrator.run({
        userId: 'user-42',
        messages: [{ role: 'user', content: 'hi' }],
        model: 'anthropic:claude-sonnet-4-20250514',
        maxSteps: 4,
      })
    );

    expect(tools.build).toHaveBeenCalledWith('user-42');
  });

  it('enables AI SDK telemetry with an agent-turn functionId', async () => {
    const config = { get: vi.fn(() => '') } as unknown as ConfigService<
      EnvConfig,
      true
    >;
    const tools = {
      build: vi.fn().mockReturnValue({}),
    } as unknown as AgentToolsFactory;

    const orchestrator = new AiSdkAgentOrchestrator(config, tools);
    orchestrator.onModuleInit();

    await collect(
      orchestrator.run({
        userId: 'u1',
        messages: [{ role: 'user', content: 'hi' }],
        model: 'anthropic:claude-sonnet-4-20250514',
        maxSteps: 4,
      })
    );

    const opts = vi.mocked(streamText).mock.calls.at(-1)?.[0];
    expect(opts?.experimental_telemetry).toMatchObject({
      isEnabled: true,
      functionId: 'agent-turn',
    });
  });

  it('uses the read-only tool set when resuming a turn', async () => {
    const config = { get: vi.fn(() => '') } as unknown as ConfigService<
      EnvConfig,
      true
    >;
    const tools = {
      build: vi.fn().mockReturnValue({}),
      buildReadOnly: vi.fn().mockReturnValue({}),
    } as unknown as AgentToolsFactory;

    const orchestrator = new AiSdkAgentOrchestrator(config, tools);
    orchestrator.onModuleInit();

    await collect(
      orchestrator.run({
        userId: 'u1',
        messages: [{ role: 'user', content: 'ok' }],
        model: 'anthropic:claude-sonnet-4-20250514',
        maxSteps: 4,
        resume: { toolName: 'proposeCreateNote', outcome: 'created' },
      })
    );

    expect(tools.buildReadOnly).toHaveBeenCalledWith('u1');
    expect(tools.build).not.toHaveBeenCalled();
    const opts = vi.mocked(streamText).mock.calls.at(-1)?.[0];
    expect(JSON.stringify(opts?.messages)).toContain('created');
  });
});

describe('extractProposal', () => {
  it('returns the proposal from a __proposal tool result', () => {
    const m = ProposedMutation.create({
      id: 'p1',
      kind: 'create',
      payload: { title: 'x', contentHtml: '<p>x</p>' },
      summary: 's',
    });
    if (m.isErr()) {
      throw new Error('setup');
    }
    const found = extractProposal([
      { toolName: 'proposeCreateNote', output: { __proposal: m.value } },
    ]);
    expect(found?.id).toBe('p1');
  });

  it('returns null when no proposal present', () => {
    expect(
      extractProposal([{ toolName: 'getNote', output: { id: 'n' } }])
    ).toBeNull();
  });

  it('returns null when __proposal is not a ProposedMutation instance', () => {
    expect(
      extractProposal([
        {
          toolName: 'proposeCreateNote',
          output: { __proposal: { id: 'fake', kind: 'create' } },
        },
      ])
    ).toBeNull();
  });
});
