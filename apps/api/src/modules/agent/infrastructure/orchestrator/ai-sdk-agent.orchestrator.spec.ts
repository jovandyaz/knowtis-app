import { ConfigService } from '@nestjs/config';
import { streamText } from 'ai';
import { describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../../config/env.config';
import { createTestChain } from '../../../ai/testing/create-test-chain';
import { ProposedMutation } from '../../domain/proposed-mutation';
import type { AgentToolContext } from '../tools/agent-tool';
import type { AgentToolRegistry } from './agent-tool.registry';
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

const MODEL = 'anthropic:claude-sonnet-4-20250514';
const FALLBACK = 'anthropic:claude-haiku-4-5-20251001';

const streamTextMock = streamText as unknown as ReturnType<typeof vi.fn>;

function makeConfig(
  over: Record<string, unknown> = {}
): ConfigService<EnvConfig, true> {
  const values: Record<string, unknown> = {
    NODE_ENV: '',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    GOOGLE_GENERATIVE_AI_API_KEY: '',
    OPENAI_API_KEY: '',
    AI_AGENT_MAX_MS: 120000,
    AI_AGENT_MAX_OUTPUT_TOKENS: 4096,
    AI_MAX_RETRIES: 3,
    AI_FALLBACK_CHAIN:
      'anthropic:claude-haiku-4-5-20251001,openai:gpt-4o-mini,google:gemini-2.0-flash',
    AI_COOLDOWN_ALLOWED_FAILS: 3,
    AI_COOLDOWN_SECONDS: 120,
    ...over,
  };
  return {
    get: vi.fn((key: string) => values[key]),
  } as unknown as ConfigService<EnvConfig, true>;
}

function makeToolRegistry(
  onResolve?: (ctx: AgentToolContext) => void
): AgentToolRegistry {
  return {
    resolve: vi.fn(async (ctx: AgentToolContext) => {
      onResolve?.(ctx);
      return {};
    }),
  } as unknown as AgentToolRegistry;
}

function makeOrchestrator(
  config = makeConfig(),
  toolRegistry = makeToolRegistry()
): AiSdkAgentOrchestrator {
  const { registry, chain } = createTestChain(config);
  return new AiSdkAgentOrchestrator(config, toolRegistry, registry, chain);
}

function collect(iter: AsyncIterable<unknown>) {
  return (async () => {
    const out = [] as unknown[];
    for await (const e of iter) {
      out.push(e);
    }
    return out;
  })();
}

const baseInput = {
  userId: 'u1',
  messages: [{ role: 'user' as const, content: 'hi' }],
  model: MODEL,
  maxSteps: 4,
};

describe('AiSdkAgentOrchestrator', () => {
  it('collects deduped getNote sources and emits them on done', async () => {
    const orchestrator = makeOrchestrator();

    const events = await collect(orchestrator.run(baseInput));

    const done = events.find(
      (e): e is { type: 'done'; sources: { id: string; title: string }[] } =>
        (e as { type: string }).type === 'done'
    );
    expect(done).toBeDefined();
    expect(done?.sources).toEqual([{ id: 'n1', title: 'Productividad' }]);
  });

  it('injects current-note context into the system prompt when noteId is given', async () => {
    const orchestrator = makeOrchestrator();

    await collect(
      orchestrator.run({
        ...baseInput,
        messages: [{ role: 'user', content: 'resume esta nota' }],
        noteId: 'note-xyz',
      })
    );

    const system = vi.mocked(streamText).mock.calls.at(-1)?.[0].system;
    expect(system).toContain('note-xyz');
  });

  it('yields a single error event (and does not throw) when the model is invalid and the chain is empty', async () => {
    const orchestrator = makeOrchestrator(
      makeConfig({ AI_FALLBACK_CHAIN: '' })
    );

    const events = await collect(
      orchestrator.run({ ...baseInput, model: 'nonexistent:model' })
    );

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'error' });
  });

  it('falls through the chain when the requested model has no provider', async () => {
    const orchestrator = makeOrchestrator();

    const events = await collect(
      orchestrator.run({ ...baseInput, model: 'nonexistent:model' })
    );

    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });

  it('yields a chunk then a done event with correct usage and model on the happy path', async () => {
    const orchestrator = makeOrchestrator();

    const events = await collect(orchestrator.run(baseInput));

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
    expect(done?.usage.model).toBe(MODEL);
  });

  it('resolves tools with a full-phase context bound to the userId', async () => {
    const contexts: AgentToolContext[] = [];
    const registry = makeToolRegistry((ctx) => contexts.push(ctx));
    const orchestrator = makeOrchestrator(makeConfig(), registry);

    await collect(orchestrator.run({ ...baseInput, userId: 'user-42' }));

    expect(contexts.at(-1)).toMatchObject({
      userId: 'user-42',
      phase: 'full',
    });
  });

  it('emits a proposal event when a propose-tool captures into the collector', async () => {
    const m = ProposedMutation.create({
      id: 'p1',
      kind: 'create',
      payload: { title: 'GTD', contentHtml: '<p>x</p>' },
      summary: 'Create GTD',
    });
    if (m.isErr()) {
      throw new Error('setup');
    }
    const registry = makeToolRegistry((ctx) => {
      ctx.proposals.capture(m.value);
    });
    const orchestrator = makeOrchestrator(makeConfig(), registry);

    const events = await collect(
      orchestrator.run({
        ...baseInput,
        messages: [{ role: 'user', content: 'create a note' }],
      })
    );

    const proposal = events.find(
      (e): e is { type: 'proposal'; proposal: ProposedMutation } =>
        (e as { type: string }).type === 'proposal'
    );
    expect(proposal?.proposal.id).toBe('p1');
    expect(
      events.find((e) => (e as { type: string }).type === 'done')
    ).toBeUndefined();
  });

  it('enables AI SDK telemetry with an agent-turn functionId', async () => {
    const orchestrator = makeOrchestrator();

    await collect(orchestrator.run(baseInput));

    const opts = vi.mocked(streamText).mock.calls.at(-1)?.[0];
    expect(opts?.experimental_telemetry).toMatchObject({
      isEnabled: true,
      functionId: 'agent-turn',
      metadata: { userId: 'u1', environment: '' },
    });
    expect(opts?.experimental_telemetry?.metadata).not.toHaveProperty('tags');
  });

  it('tags telemetry metadata with resume when resuming a turn', async () => {
    const orchestrator = makeOrchestrator(
      makeConfig({ NODE_ENV: 'development' })
    );

    await collect(
      orchestrator.run({
        ...baseInput,
        messages: [{ role: 'user', content: 'ok' }],
        resume: { toolName: 'proposeCreateNote', outcome: 'created' },
      })
    );

    const opts = vi.mocked(streamText).mock.calls.at(-1)?.[0];
    expect(opts?.experimental_telemetry?.metadata).toMatchObject({
      userId: 'u1',
      environment: 'development',
      tags: ['resume'],
    });
  });

  it('injects incoming knownNotes into the system prompt and returns the merged set on done', async () => {
    const orchestrator = makeOrchestrator();

    const events = await collect(
      orchestrator.run({
        userId: 'u1',
        messages: [{ role: 'user', content: 'resume esa nota' }],
        model: 'anthropic:claude-sonnet-4-20250514',
        maxSteps: 4,
        knownNotes: [{ id: 'prev-id', title: 'Earlier note' }],
      })
    );

    const system = vi.mocked(streamText).mock.calls.at(-1)?.[0].system;
    expect(system).toContain('Earlier note');
    expect(system).toContain('prev-id');

    const done = events.find(
      (e): e is { type: 'done'; knownNotes: { id: string; title: string }[] } =>
        (e as { type: string }).type === 'done'
    );
    expect(done?.knownNotes).toEqual(
      expect.arrayContaining([
        { id: 'prev-id', title: 'Earlier note' },
        { id: 'n1', title: 'Productividad' },
        { id: 'sx', title: 'ignored' },
      ])
    );
  });

  it('resolves a read-only-phase context when resuming a turn', async () => {
    const contexts: AgentToolContext[] = [];
    const registry = makeToolRegistry((ctx) => contexts.push(ctx));
    const orchestrator = makeOrchestrator(makeConfig(), registry);

    await collect(
      orchestrator.run({
        ...baseInput,
        messages: [{ role: 'user', content: 'ok' }],
        resume: { toolName: 'proposeCreateNote', outcome: 'created' },
      })
    );

    expect(contexts.at(-1)).toMatchObject({ userId: 'u1', phase: 'readonly' });
    const opts = vi.mocked(streamText).mock.calls.at(-1)?.[0];
    expect(JSON.stringify(opts?.messages)).toContain('created');
  });

  it('passes a timeout-combined abort signal, output cap, retries, and temperature to streamText', async () => {
    const orchestrator = makeOrchestrator();
    const controller = new AbortController();

    await collect(
      orchestrator.run({ ...baseInput, signal: controller.signal })
    );

    const opts = vi.mocked(streamText).mock.calls.at(-1)?.[0];
    expect(opts?.maxOutputTokens).toBe(4096);
    expect(opts?.maxRetries).toBe(3);
    expect(opts?.temperature).toBe(0.7);
    expect(opts?.abortSignal).toBeInstanceOf(AbortSignal);
    expect(opts?.abortSignal?.aborted).toBe(false);
    controller.abort();
    expect(opts?.abortSignal?.aborted).toBe(true);
  });

  it('passes the timeout abort signal even without a caller signal', async () => {
    const orchestrator = makeOrchestrator();

    await collect(orchestrator.run(baseInput));

    const opts = vi.mocked(streamText).mock.calls.at(-1)?.[0];
    expect(opts?.abortSignal).toBeInstanceOf(AbortSignal);
    expect(opts?.abortSignal?.aborted).toBe(false);
  });

  it('yields an aborted event with accumulated step usage when the caller aborts mid-stream', async () => {
    const controller = new AbortController();
    streamTextMock.mockImplementationOnce(
      (opts: {
        onStepFinish?: (s: {
          toolResults: unknown[];
          usage: { inputTokens: number; outputTokens: number };
        }) => void;
      }) => ({
        textStream: (async function* () {
          opts.onStepFinish?.({
            toolResults: [],
            usage: { inputTokens: 5, outputTokens: 2 },
          });
          yield 'partial';
          controller.abort();
          throw new DOMException('aborted', 'AbortError');
        })(),
        totalUsage: new Promise(() => {}),
      })
    );
    const orchestrator = makeOrchestrator();

    const events = await collect(
      orchestrator.run({ ...baseInput, signal: controller.signal })
    );

    expect(events).toContainEqual({ type: 'chunk', text: 'partial' });
    expect(events.at(-1)).toEqual({
      type: 'aborted',
      usage: { inputTokens: 5, outputTokens: 2, model: MODEL },
    });
  });

  it('yields aborted (not done) when the stream ends gracefully after the caller aborts', async () => {
    const controller = new AbortController();
    streamTextMock.mockImplementationOnce(
      (opts: {
        onStepFinish?: (s: {
          toolResults: unknown[];
          usage: { inputTokens: number; outputTokens: number };
        }) => void;
      }) => ({
        textStream: (async function* () {
          opts.onStepFinish?.({
            toolResults: [],
            usage: { inputTokens: 4, outputTokens: 1 },
          });
          yield 'partial';
          controller.abort();
        })(),
        totalUsage: new Promise(() => {}),
      })
    );
    const orchestrator = makeOrchestrator();

    const events = await collect(
      orchestrator.run({ ...baseInput, signal: controller.signal })
    );

    expect(events.at(-1)).toEqual({
      type: 'aborted',
      usage: { inputTokens: 4, outputTokens: 1, model: MODEL },
    });
    expect(
      events.find((e) => (e as { type: string }).type === 'done')
    ).toBeUndefined();
  });

  it('yields an error event carrying best-effort usage when the stream fails mid-turn', async () => {
    streamTextMock.mockImplementationOnce(
      (opts: {
        onStepFinish?: (s: {
          toolResults: unknown[];
          usage: { inputTokens: number; outputTokens: number };
        }) => void;
      }) => ({
        textStream: (async function* () {
          opts.onStepFinish?.({
            toolResults: [],
            usage: { inputTokens: 5, outputTokens: 2 },
          });
          yield 'partial';
          throw new Error('boom');
        })(),
        totalUsage: new Promise(() => {}),
      })
    );
    const orchestrator = makeOrchestrator();

    const events = await collect(orchestrator.run(baseInput));

    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'AI_PROVIDER_ERROR' },
      usage: { inputTokens: 5, outputTokens: 2, model: MODEL },
    });
  });

  it('converts a turn-timeout abort into an error event with usage', async () => {
    streamTextMock.mockImplementationOnce(
      (opts: {
        onStepFinish?: (s: {
          toolResults: unknown[];
          usage: { inputTokens: number; outputTokens: number };
        }) => void;
      }) => ({
        textStream: (async function* () {
          opts.onStepFinish?.({
            toolResults: [],
            usage: { inputTokens: 3, outputTokens: 1 },
          });
          yield 'x';
          await new Promise((resolve) => setTimeout(resolve, 30));
          throw new DOMException('aborted', 'AbortError');
        })(),
        totalUsage: new Promise(() => {}),
      })
    );
    const orchestrator = makeOrchestrator(makeConfig({ AI_AGENT_MAX_MS: 5 }));

    const events = await collect(orchestrator.run(baseInput));

    const last = events.at(-1) as {
      type: string;
      error: { code: string; message: string };
      usage: { inputTokens: number; outputTokens: number };
    };
    expect(last.type).toBe('error');
    expect(last.error.code).toBe('AI_PROVIDER_ERROR');
    expect(last.error.message).toContain('timed out');
    expect(last.usage).toMatchObject({ inputTokens: 3, outputTokens: 1 });
  });

  it('retries the whole turn on the next chain model when the primary stream fails before any progress', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(() => ({
      textStream: {
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(new Error('primary down')),
        }),
      },
      totalUsage: new Promise(() => {}),
    }));
    const orchestrator = makeOrchestrator();

    const events = await collect(orchestrator.run(baseInput));

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    const retryModel = streamTextMock.mock.calls.at(-1)?.[0].model as {
      modelId: string;
    };
    expect(retryModel.modelId).toBe('claude-haiku-4-5-20251001');
    expect(events).toContainEqual({ type: 'chunk', text: 'Hello' });
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      usage: { model: FALLBACK },
    });
  });

  it('retries the turn on the next chain model when streamText throws synchronously', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(() => {
      throw new Error('sync boom');
    });
    const orchestrator = makeOrchestrator();

    const events = await collect(orchestrator.run(baseInput));

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });

  it('does not retry on the chain once a tool step has finished', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(
      (opts: {
        onStepFinish?: (s: {
          toolResults: unknown[];
          usage: { inputTokens: number; outputTokens: number };
        }) => void;
      }) => ({
        textStream: {
          [Symbol.asyncIterator]: () => ({
            next: () => {
              opts.onStepFinish?.({
                toolResults: [],
                usage: { inputTokens: 2, outputTokens: 0 },
              });
              return Promise.reject(new Error('mid-turn failure'));
            },
          }),
        },
        totalUsage: new Promise(() => {}),
      })
    );
    const orchestrator = makeOrchestrator();

    const events = await collect(orchestrator.run(baseInput));

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'AI_PROVIDER_ERROR' },
      usage: { inputTokens: 2, outputTokens: 0, model: MODEL },
    });
  });

  it('does not fall back when the caller aborts before the first chunk', async () => {
    streamTextMock.mockClear();
    const controller = new AbortController();
    streamTextMock.mockImplementationOnce(() => ({
      textStream: {
        [Symbol.asyncIterator]: () => ({
          next: () => {
            controller.abort();
            return Promise.reject(new DOMException('aborted', 'AbortError'));
          },
        }),
      },
      totalUsage: new Promise(() => {}),
    }));
    const orchestrator = makeOrchestrator();

    const events = await collect(
      orchestrator.run({ ...baseInput, signal: controller.signal })
    );

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toEqual({
      type: 'aborted',
      usage: { inputTokens: 0, outputTokens: 0, model: MODEL },
    });
  });

  it('skips the fallback chain and builds the model with the BYOK key', async () => {
    const config = makeConfig();
    const { registry, chain } = createTestChain(config);
    const candidatesSpy = vi.spyOn(chain, 'candidatesFor');
    const languageModelSpy = vi.spyOn(registry, 'languageModel');
    const orchestrator = new AiSdkAgentOrchestrator(
      config,
      makeToolRegistry(),
      registry,
      chain
    );

    const events = await collect(
      orchestrator.run({
        ...baseInput,
        model: 'google:gemini-3.5-flash',
        byokApiKey: 'user-key',
      })
    );

    expect(candidatesSpy).not.toHaveBeenCalled();
    expect(languageModelSpy).toHaveBeenCalledWith(
      'google:gemini-3.5-flash',
      'user-key'
    );
    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });

  it('does not fall back when the chain has no other candidates', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(() => ({
      textStream: {
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(new Error('primary down')),
        }),
      },
      totalUsage: new Promise(() => {}),
    }));
    const orchestrator = makeOrchestrator(
      makeConfig({ AI_FALLBACK_CHAIN: '' })
    );

    const events = await collect(orchestrator.run(baseInput));

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'AI_PROVIDER_ERROR' },
    });
  });
});
