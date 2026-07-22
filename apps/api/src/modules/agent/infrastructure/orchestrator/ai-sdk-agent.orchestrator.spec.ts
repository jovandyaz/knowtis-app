import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { streamText } from 'ai';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { EnvConfig } from '../../../../config/env.config';
import { createTestChain } from '../../../ai/testing/create-test-chain';
import type { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
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
          fullStream: (async function* () {
            yield { type: 'reasoning-delta', id: 'r1', text: 'pondering' };
            yield { type: 'text-delta', id: 't1', text: 'Hello' };
          })(),
          totalUsage: Promise.resolve({ inputTokens: 3, outputTokens: 2 }),
        };
      }
    ),
  };
});

const MODEL = 'anthropic:claude-sonnet-4-20250514';
const FALLBACK = 'anthropic:claude-haiku-4-5-20251001';
const STALL_MS = 60000;
const TTFT_MS = STALL_MS / 2;

const streamTextMock = streamText as unknown as ReturnType<typeof vi.fn>;

function makeConfig(
  over: Record<string, unknown> = {}
): ConfigService<EnvConfig, true> {
  const values: Record<string, unknown> = {
    NODE_ENV: '',
    ANTHROPIC_API_KEY: 'test-anthropic-key',
    GOOGLE_GENERATIVE_AI_API_KEY: '',
    OPENAI_API_KEY: '',
    OPENROUTER_API_KEY: 'test-openrouter-key',
    AI_AGENT_MAX_MS: 120000,
    AI_AGENT_STALL_MS: STALL_MS,
    AI_AGENT_MAX_OUTPUT_TOKENS: 4096,
    AI_MAX_RETRIES: 3,
    AI_COOLDOWN_ALLOWED_FAILS: 3,
    AI_COOLDOWN_SECONDS: 120,
    ...over,
  };
  // Absent an explicit override, the first-part budget mirrors the stall budget
  // so pre-existing timing specs behave exactly as they did before TTFT existed.
  if (values.AI_AGENT_TTFT_MS === undefined) {
    values.AI_AGENT_TTFT_MS = values.AI_AGENT_STALL_MS;
  }
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

function makeFlags(enabled = false): FeatureFlagsService {
  return {
    isEnabled: vi.fn().mockResolvedValue(enabled),
  } as unknown as FeatureFlagsService;
}

function makeOrchestrator(
  config = makeConfig(),
  toolRegistry = makeToolRegistry(),
  flags = makeFlags(),
  fallbackChain?: string
): AiSdkAgentOrchestrator {
  const { registry, chain } = createTestChain(config, fallbackChain);
  return new AiSdkAgentOrchestrator(
    config,
    toolRegistry,
    registry,
    chain,
    flags
  );
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
  afterEach(() => {
    vi.useRealTimers();
  });

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

  it('passes the reasoning effort to openrouter models only', async () => {
    streamTextMock.mockClear();
    const orchestrator = makeOrchestrator();

    await collect(
      orchestrator.run({
        ...baseInput,
        model: 'openrouter:z-ai/glm-5.2',
        reasoningEffort: 'low',
      })
    );

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { openrouter: { reasoning: { effort: 'low' } } },
      })
    );
  });

  it('omits providerOptions for non-openrouter models', async () => {
    streamTextMock.mockClear();
    const orchestrator = makeOrchestrator();

    await collect(orchestrator.run({ ...baseInput, reasoningEffort: 'low' }));

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ providerOptions: expect.anything() })
    );
  });

  it('merges reasoning effort and provider order under one openrouter object', async () => {
    streamTextMock.mockClear();
    const orchestrator = makeOrchestrator();

    await collect(
      orchestrator.run({
        ...baseInput,
        model: 'openrouter:z-ai/glm-5.2',
        reasoningEffort: 'low',
        openrouterProviderOrder: ['fireworks', 'together'],
      })
    );

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: {
          openrouter: {
            reasoning: { effort: 'low' },
            provider: {
              order: ['fireworks', 'together'],
              allow_fallbacks: true,
            },
          },
        },
      })
    );
  });

  it('passes the provider order without reasoning when no effort is set', async () => {
    streamTextMock.mockClear();
    const orchestrator = makeOrchestrator();

    await collect(
      orchestrator.run({
        ...baseInput,
        model: 'openrouter:z-ai/glm-5.2',
        openrouterProviderOrder: ['fireworks'],
      })
    );

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: {
          openrouter: {
            provider: { order: ['fireworks'], allow_fallbacks: true },
          },
        },
      })
    );
  });

  it('omits the provider key when the order list is empty', async () => {
    streamTextMock.mockClear();
    const orchestrator = makeOrchestrator();

    await collect(
      orchestrator.run({
        ...baseInput,
        model: 'openrouter:z-ai/glm-5.2',
        reasoningEffort: 'low',
        openrouterProviderOrder: [],
      })
    );

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        providerOptions: { openrouter: { reasoning: { effort: 'low' } } },
      })
    );
  });

  it('omits providerOptions for non-openrouter models even with a provider order', async () => {
    streamTextMock.mockClear();
    const orchestrator = makeOrchestrator();

    await collect(
      orchestrator.run({
        ...baseInput,
        openrouterProviderOrder: ['fireworks'],
      })
    );

    expect(streamTextMock).toHaveBeenCalledWith(
      expect.not.objectContaining({ providerOptions: expect.anything() })
    );
  });

  it('drops providerOptions when an openrouter turn fails over to another provider', async () => {
    streamTextMock.mockClear();
    streamTextMock
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield { type: 'reasoning-delta', id: 'r1', text: 'hmm' };
          throw new Error('provider exploded');
        })(),
        totalUsage: new Promise(() => {}),
      }))
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', id: 't1', text: 'fallback answer' };
        })(),
        totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      }));
    const orchestrator = makeOrchestrator(
      makeConfig(),
      makeToolRegistry(),
      makeFlags(),
      FALLBACK
    );

    await collect(
      orchestrator.run({
        ...baseInput,
        model: 'openrouter:z-ai/glm-5.2',
        reasoningEffort: 'high',
      })
    );

    expect(streamTextMock.mock.calls[0][0]).toHaveProperty('providerOptions');
    expect(streamTextMock.mock.calls[1][0]).not.toHaveProperty(
      'providerOptions'
    );
  });

  it('yields a single error event (and does not throw) when the model is invalid and the chain is empty', async () => {
    const orchestrator = makeOrchestrator(
      makeConfig(),
      makeToolRegistry(),
      makeFlags(),
      ''
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

  it('redacts provider error details when a BYOK key is in scope', async () => {
    const orchestrator = makeOrchestrator();
    streamTextMock.mockImplementationOnce(() => {
      throw new Error('Incorrect API key provided: sk-secret-abc123');
    });

    const events = await collect(
      orchestrator.run({ ...baseInput, byokApiKey: 'user-key' })
    );

    expect(events).toHaveLength(1);
    const error = (events[0] as { error: { message: string } }).error;
    expect(error.message).not.toContain('sk-secret');
    expect(error.message).toContain('BYOK provider request failed');
  });

  it('maps a transient overloaded provider error to a clear code instead of the redacted BYOK message', async () => {
    const orchestrator = makeOrchestrator();
    streamTextMock.mockImplementationOnce(() => {
      throw Object.assign(new Error('Failed after 4 attempts'), {
        lastError: { statusCode: 503 },
      });
    });

    const events = await collect(
      orchestrator.run({ ...baseInput, byokApiKey: 'user-key' })
    );

    expect(events).toHaveLength(1);
    const error = (events[0] as { error: { code: string; message: string } })
      .error;
    expect(error.code).toBe('AI_PROVIDER_OVERLOADED');
    expect(error.message).not.toContain('BYOK provider request failed');
    expect(error.message).toContain('overloaded');
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

  it('yields thinking events for reasoning deltas before the answer chunks', async () => {
    const orchestrator = makeOrchestrator();

    const events = await collect(orchestrator.run(baseInput));

    expect(events[0]).toEqual({ type: 'thinking', text: 'pondering' });
    expect(events[1]).toEqual({ type: 'chunk', text: 'Hello' });
  });

  it('falls through to the next model when the primary dies after reasoning only', async () => {
    streamTextMock
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield { type: 'reasoning-delta', id: 'r1', text: 'hmm' };
          throw new Error('provider exploded');
        })(),
        totalUsage: new Promise(() => {}),
      }))
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', id: 't1', text: 'fallback answer' };
        })(),
        totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      }));
    const orchestrator = makeOrchestrator(
      makeConfig(),
      makeToolRegistry(),
      makeFlags(),
      FALLBACK
    );

    const events = await collect(orchestrator.run(baseInput));

    expect(
      events.some(
        (e) =>
          (e as { type: string; text?: string }).type === 'chunk' &&
          (e as { text?: string }).text === 'fallback answer'
      )
    ).toBe(true);
    expect(events.some((e) => (e as { type: string }).type === 'error')).toBe(
      false
    );
  });

  it('resolves tools with a full-phase context bound to the userId', async () => {
    const contexts: AgentToolContext[] = [];
    const registry = makeToolRegistry((ctx) => contexts.push(ctx));
    const orchestrator = makeOrchestrator(makeConfig(), registry);

    await collect(orchestrator.run({ ...baseInput, userId: 'user-42' }));

    expect(contexts.at(-1)).toMatchObject({
      userId: 'user-42',
      phase: 'full',
      byokTurn: false,
    });
  });

  it('marks the tool context as a byok turn when a byok key is in scope', async () => {
    const contexts: AgentToolContext[] = [];
    const registry = makeToolRegistry((ctx) => contexts.push(ctx));
    const orchestrator = makeOrchestrator(makeConfig(), registry);

    await collect(orchestrator.run({ ...baseInput, byokApiKey: 'user-key' }));

    expect(contexts.at(-1)).toMatchObject({ byokTurn: true });
  });

  it('allows a url from an earlier user turn for webFetch, but not one from an assistant turn', async () => {
    const contexts: AgentToolContext[] = [];
    const registry = makeToolRegistry((ctx) => contexts.push(ctx));
    const orchestrator = makeOrchestrator(makeConfig(), registry);

    await collect(
      orchestrator.run({
        ...baseInput,
        messages: [
          { role: 'user', content: 'see https://a.test/one' },
          { role: 'assistant', content: 'noted https://evil.test/x' },
          { role: 'user', content: 'fetch it' },
        ],
      })
    );

    const allowlist = contexts.at(-1)?.webFetchAllowlist;
    expect(allowlist?.has('https://a.test/one')).toBe(true);
    expect(allowlist?.has('https://evil.test/x')).toBe(false);
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
        fullStream: (async function* () {
          opts.onStepFinish?.({
            toolResults: [],
            usage: { inputTokens: 5, outputTokens: 2 },
          });
          yield { type: 'text-delta', id: 't1', text: 'partial' };
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
        fullStream: (async function* () {
          opts.onStepFinish?.({
            toolResults: [],
            usage: { inputTokens: 4, outputTokens: 1 },
          });
          yield { type: 'text-delta', id: 't1', text: 'partial' };
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
        fullStream: (async function* () {
          opts.onStepFinish?.({
            toolResults: [],
            usage: { inputTokens: 5, outputTokens: 2 },
          });
          yield { type: 'text-delta', id: 't1', text: 'partial' };
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
        fullStream: (async function* () {
          opts.onStepFinish?.({
            toolResults: [],
            usage: { inputTokens: 3, outputTokens: 1 },
          });
          yield { type: 'text-delta', id: 't1', text: 'x' };
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
    expect(last.error.code).toBe('AI_TIMEOUT');
    expect(last.error.message).toContain('timed out');
    expect(last.usage).toMatchObject({ inputTokens: 3, outputTokens: 1 });
  });

  // The hang must reject on abort: a promise that never settles would keep the
  // turn pending forever once the stall watchdog fires.
  function hangingAfter(parts: readonly unknown[]) {
    return ({ abortSignal }: { abortSignal: AbortSignal }) => ({
      fullStream: (async function* () {
        for (const part of parts) {
          yield part;
        }
        await new Promise((_, reject) => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          if (abortSignal.aborted) {
            reject(error);
            return;
          }
          abortSignal.addEventListener('abort', () => reject(error), {
            once: true,
          });
        });
      })(),
      totalUsage: new Promise(() => {}),
    });
  }

  it('aborts a silent candidate at the stall budget and falls through to the fallback', async () => {
    vi.useFakeTimers();
    streamTextMock.mockClear();
    streamTextMock
      .mockImplementationOnce(
        hangingAfter([{ type: 'reasoning-delta', id: 'r1', text: 'hmm' }])
      )
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', id: 't1', text: 'fallback answer' };
        })(),
        totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      }));
    const orchestrator = makeOrchestrator(
      makeConfig(),
      makeToolRegistry(),
      makeFlags(),
      FALLBACK
    );

    const consumed = collect(orchestrator.run(baseInput));
    await vi.advanceTimersByTimeAsync(STALL_MS);
    const events = await consumed;

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: 'chunk', text: 'fallback answer' });
    expect(events.some((e) => (e as { type: string }).type === 'error')).toBe(
      false
    );
  });

  it('reports AI_TIMEOUT when both attempts of the last candidate stay silent', async () => {
    vi.useFakeTimers();
    streamTextMock.mockClear();
    streamTextMock
      .mockImplementationOnce(hangingAfter([]))
      .mockImplementationOnce(hangingAfter([]));
    const orchestrator = makeOrchestrator(
      makeConfig({ AI_AGENT_TTFT_MS: TTFT_MS }),
      makeToolRegistry(),
      makeFlags(),
      ''
    );

    const consumed = collect(orchestrator.run(baseInput));
    await vi.advanceTimersByTimeAsync(TTFT_MS);
    await vi.advanceTimersByTimeAsync(TTFT_MS);
    const events = await consumed;

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'AI_TIMEOUT' },
    });
  });

  it('a stall after delivered text ends the turn with AI_TIMEOUT instead of switching models', async () => {
    vi.useFakeTimers();
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(
      hangingAfter([{ type: 'text-delta', id: 't1', text: 'partial ' }])
    );
    const orchestrator = makeOrchestrator(
      makeConfig(),
      makeToolRegistry(),
      makeFlags(),
      FALLBACK
    );

    const consumed = collect(orchestrator.run(baseInput));
    await vi.advanceTimersByTimeAsync(STALL_MS);
    const events = await consumed;

    expect(events).toContainEqual({ type: 'chunk', text: 'partial ' });
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'AI_TIMEOUT' },
    });
    expect(streamTextMock).toHaveBeenCalledTimes(1);
  });

  it('retries a silent BYOK turn once with the same key, then reports AI_TIMEOUT without advancing the chain', async () => {
    vi.useFakeTimers();
    streamTextMock.mockClear();
    streamTextMock
      .mockImplementationOnce(hangingAfter([]))
      .mockImplementationOnce(hangingAfter([]));
    const config = makeConfig({ AI_AGENT_TTFT_MS: TTFT_MS });
    const { registry, chain } = createTestChain(config);
    const candidatesSpy = vi.spyOn(chain, 'candidatesFor');
    const languageModelSpy = vi.spyOn(registry, 'languageModel');
    const orchestrator = new AiSdkAgentOrchestrator(
      config,
      makeToolRegistry(),
      registry,
      chain,
      makeFlags()
    );

    const consumed = collect(
      orchestrator.run({ ...baseInput, byokApiKey: 'user-key' })
    );
    await vi.advanceTimersByTimeAsync(TTFT_MS);
    await vi.advanceTimersByTimeAsync(TTFT_MS);
    const events = await consumed;

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(candidatesSpy).not.toHaveBeenCalled();
    expect(
      languageModelSpy.mock.calls.every(([, key]) => key === 'user-key')
    ).toBe(true);
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'AI_TIMEOUT' },
    });
  });

  // How the SDK really ends an aborted stream: it enqueues a final abort part
  // and closes, so the turn exits the loop normally instead of rejecting. A
  // settling totalUsage keeps the after-loop stall check the only way out.
  function abortsGracefullyAfter(parts: readonly unknown[]) {
    return ({ abortSignal }: { abortSignal: AbortSignal }) => ({
      fullStream: (async function* () {
        for (const part of parts) {
          yield part;
        }
        await new Promise<void>((resolve) => {
          if (abortSignal.aborted) {
            resolve();
            return;
          }
          abortSignal.addEventListener('abort', () => resolve(), {
            once: true,
          });
        });
        yield { type: 'abort' };
      })(),
      totalUsage: Promise.resolve({ inputTokens: 9, outputTokens: 9 }),
    });
  }

  it('falls through to the fallback when a silent candidate ends gracefully on the stall abort', async () => {
    vi.useFakeTimers();
    streamTextMock.mockClear();
    streamTextMock
      .mockImplementationOnce(
        abortsGracefullyAfter([
          { type: 'reasoning-delta', id: 'r1', text: 'hmm' },
        ])
      )
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', id: 't1', text: 'fallback answer' };
        })(),
        totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      }));
    const orchestrator = makeOrchestrator(
      makeConfig(),
      makeToolRegistry(),
      makeFlags(),
      FALLBACK
    );
    const warnSpy = vi.spyOn(Logger.prototype, 'warn');

    const consumed = collect(orchestrator.run(baseInput));
    await vi.advanceTimersByTimeAsync(STALL_MS);
    const events = await consumed;

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: 'chunk', text: 'fallback answer' });
    expect(events.some((e) => (e as { type: string }).type === 'error')).toBe(
      false
    );
    expect(events.at(-1)).toMatchObject({ type: 'done' });
    const stallLogs = warnSpy.mock.calls.filter(
      ([entry]) =>
        typeof entry === 'object' &&
        entry !== null &&
        (entry as { event?: string }).event === 'agent.turn.stall'
    );
    expect(stallLogs).toHaveLength(1);
    warnSpy.mockRestore();
  });

  it('retries then reports AI_TIMEOUT when both attempts of the last candidate end gracefully on the abort', async () => {
    vi.useFakeTimers();
    streamTextMock.mockClear();
    streamTextMock
      .mockImplementationOnce(abortsGracefullyAfter([{ type: 'start' }]))
      .mockImplementationOnce(abortsGracefullyAfter([{ type: 'start' }]));
    const orchestrator = makeOrchestrator(
      makeConfig({ AI_AGENT_TTFT_MS: TTFT_MS }),
      makeToolRegistry(),
      makeFlags(),
      ''
    );

    const consumed = collect(orchestrator.run(baseInput));
    await vi.advanceTimersByTimeAsync(TTFT_MS);
    await vi.advanceTimersByTimeAsync(TTFT_MS);
    const events = await consumed;

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    const last = events.at(-1) as {
      type: string;
      error: { code: string; message: string };
    };
    expect(last.type).toBe('error');
    expect(last.error.code).toBe('AI_TIMEOUT');
    expect(last.error.message).toContain('stalled');
  });

  function retryLogsFrom(
    spy: ReturnType<typeof vi.spyOn>
  ): Record<string, unknown>[] {
    const calls = spy.mock.calls as unknown as unknown[][];
    return calls
      .map((call) => call[0])
      .filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === 'object' &&
          entry !== null &&
          (entry as { event?: string }).event === 'agent.turn.retry'
      );
  }

  it('retries the same candidate once when the first attempt is silent through the ttft budget', async () => {
    vi.useFakeTimers();
    streamTextMock.mockClear();
    // The dead stream still emits the SDK's local 'start' marker: the retry must
    // fire despite it, proving parts/ttfp exclude the marker.
    streamTextMock
      .mockImplementationOnce(hangingAfter([{ type: 'start' }]))
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', id: 't1', text: 'Hello' };
          yield { type: 'finish', finishReason: 'stop' };
        })(),
        totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      }));
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    const warnSpy = vi.spyOn(Logger.prototype, 'warn');
    const orchestrator = makeOrchestrator(
      makeConfig({ AI_AGENT_TTFT_MS: TTFT_MS })
    );

    const consumed = collect(orchestrator.run(baseInput));
    await vi.advanceTimersByTimeAsync(TTFT_MS);
    const events = await consumed;

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: 'chunk', text: 'Hello' });
    expect(events.at(-1)).toMatchObject({ type: 'done' });
    expect(healthLogsFrom(logSpy)).toHaveLength(2);
    const retryLogs = retryLogsFrom(warnSpy);
    expect(retryLogs).toHaveLength(1);
    expect(retryLogs[0]).toMatchObject({ attempt: 1, reason: 'ttft' });
    logSpy.mockRestore();
    warnSpy.mockRestore();
  });

  it('advances the chain when both attempts of a non-last candidate stay silent', async () => {
    vi.useFakeTimers();
    streamTextMock.mockClear();
    streamTextMock
      .mockImplementationOnce(hangingAfter([{ type: 'start' }]))
      .mockImplementationOnce(hangingAfter([{ type: 'start' }]))
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', id: 't1', text: 'fallback answer' };
        })(),
        totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      }));
    const orchestrator = makeOrchestrator(
      makeConfig({ AI_AGENT_TTFT_MS: TTFT_MS }),
      makeToolRegistry(),
      makeFlags(),
      FALLBACK
    );

    const consumed = collect(orchestrator.run(baseInput));
    await vi.advanceTimersByTimeAsync(TTFT_MS);
    await vi.advanceTimersByTimeAsync(TTFT_MS);
    const events = await consumed;

    expect(streamTextMock).toHaveBeenCalledTimes(3);
    expect(events).toContainEqual({ type: 'chunk', text: 'fallback answer' });
    expect(events.some((e) => (e as { type: string }).type === 'error')).toBe(
      false
    );
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      usage: { model: FALLBACK },
    });
  });

  it('switches from the ttft budget to the stall budget after the first part arrives', async () => {
    vi.useFakeTimers();
    streamTextMock.mockClear();
    // Leads with the SDK's local 'start' marker, then the real first part only
    // after half the TTFT budget: the switch must key off the real part (so the
    // ttfp measures from it), not the instantly-emitted marker.
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: 'start' };
        await new Promise((resolve) => setTimeout(resolve, TTFT_MS / 2));
        yield { type: 'text-delta', id: 't1', text: 'Hello' };
        await new Promise((resolve) =>
          setTimeout(resolve, TTFT_MS + TTFT_MS / 2)
        );
        yield { type: 'text-delta', id: 't2', text: ' world' };
      })(),
      totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
    }));
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    const orchestrator = makeOrchestrator(
      makeConfig({ AI_AGENT_TTFT_MS: TTFT_MS })
    );

    const consumed = collect(orchestrator.run(baseInput));
    await vi.advanceTimersByTimeAsync(TTFT_MS * 3);
    const events = await consumed;

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ type: 'chunk', text: 'Hello' });
    expect(events).toContainEqual({ type: 'chunk', text: ' world' });
    expect(events.at(-1)).toMatchObject({ type: 'done' });
    const healthLogs = healthLogsFrom(logSpy);
    expect(healthLogs).toHaveLength(1);
    expect(healthLogs[0]).toMatchObject({ parts: 2, textDeltas: 2 });
    expect(healthLogs[0].ttfpMs).toBeGreaterThanOrEqual(TTFT_MS / 2);
    logSpy.mockRestore();
  });

  // Ignoring the abort makes every deadline fire before the rejection lands, so
  // the interruption checks are forced to rank a stall against the global ones.
  function hangsPastEveryDeadline(delayMs: number) {
    return () => ({
      fullStream: {
        [Symbol.asyncIterator]: () => ({
          next: async () => {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            throw new DOMException('aborted', 'AbortError');
          },
        }),
      },
      totalUsage: new Promise(() => {}),
    });
  }

  const RACE_STALL_MS = 5;
  const RACE_CEILING_MS = 20;
  const RACE_HANG_MS = 60;

  it('reports a user cancel as aborted even though the stall budget also elapsed', async () => {
    streamTextMock.mockClear();
    const controller = new AbortController();
    streamTextMock.mockImplementationOnce(hangsPastEveryDeadline(RACE_HANG_MS));
    const orchestrator = makeOrchestrator(
      makeConfig({ AI_AGENT_STALL_MS: RACE_STALL_MS }),
      makeToolRegistry(),
      makeFlags(),
      ''
    );

    const consumed = collect(
      orchestrator.run({ ...baseInput, signal: controller.signal })
    );
    controller.abort();
    const events = await consumed;

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ type: 'aborted' });
  });

  it('reports the wall-clock ceiling as a timeout even though the stall budget elapsed first', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(hangsPastEveryDeadline(RACE_HANG_MS));
    const orchestrator = makeOrchestrator(
      makeConfig({
        AI_AGENT_MAX_MS: RACE_CEILING_MS,
        AI_AGENT_STALL_MS: RACE_STALL_MS,
      }),
      makeToolRegistry(),
      makeFlags(),
      ''
    );

    const events = await collect(orchestrator.run(baseInput));

    const error = (
      events.at(-1) as { error: { code: string; message: string } }
    ).error;
    expect(error.code).toBe('AI_TIMEOUT');
    expect(error.message).toContain('timed out');
    expect(error.message).not.toContain('stalled');
  });

  it('re-arms the stall budget on every stream part so a slow but active model runs past it', async () => {
    vi.useFakeTimers();
    streamTextMock.mockClear();
    const halfStall = STALL_MS / 2;
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        for (const text of ['one ', 'two ', 'three ']) {
          await new Promise((resolve) => setTimeout(resolve, halfStall));
          yield { type: 'reasoning-delta', id: 'r1', text };
        }
        yield { type: 'text-delta', id: 't1', text: 'done thinking' };
      })(),
      totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
    }));
    const orchestrator = makeOrchestrator();

    const consumed = collect(orchestrator.run(baseInput));
    await vi.advanceTimersByTimeAsync(halfStall * 3);
    const events = await consumed;

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(events).toContainEqual({ type: 'chunk', text: 'done thinking' });
    expect(events.at(-1)).toMatchObject({ type: 'done' });
  });

  it('retries the whole turn on the next chain model when the primary stream fails before any progress', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: {
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
        fullStream: {
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
      fullStream: {
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
      chain,
      makeFlags()
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
      fullStream: {
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.reject(new Error('primary down')),
        }),
      },
      totalUsage: new Promise(() => {}),
    }));
    const orchestrator = makeOrchestrator(
      makeConfig(),
      makeToolRegistry(),
      makeFlags(),
      ''
    );

    const events = await collect(orchestrator.run(baseInput));

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'AI_PROVIDER_ERROR' },
    });
  });

  it('records a cooldown failure when the last candidate ends in an error event', async () => {
    // Single-candidate chain: the sole (last) candidate yields an error event
    // instead of throwing, so recordFailure can only come from isFailureChunk.
    const config = makeConfig();
    const { registry, chain } = createTestChain(config, '');
    const recordFailure = vi.spyOn(chain.cooldown, 'recordFailure');
    const recordSuccess = vi.spyOn(chain.cooldown, 'recordSuccess');
    const orchestrator = new AiSdkAgentOrchestrator(
      config,
      makeToolRegistry(),
      registry,
      chain,
      makeFlags()
    );
    streamTextMock.mockClear();
    streamTextMock.mockImplementation(() => {
      throw new Error('provider down');
    });

    const events = await collect(orchestrator.run(baseInput));

    expect(streamTextMock).toHaveBeenCalledTimes(1);
    expect(events.at(-1)).toMatchObject({ type: 'error' });
    expect(recordFailure).toHaveBeenCalledWith('anthropic');
    expect(recordSuccess).not.toHaveBeenCalled();
  });

  function happyStream() {
    return {
      fullStream: (async function* () {
        yield { type: 'text-delta', id: 't1', text: 'Hello' };
      })(),
      totalUsage: Promise.resolve({ inputTokens: 3, outputTokens: 2 }),
    };
  }

  it('caches the system prompt and the last message when the prompt-caching flag is on', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementation(happyStream);
    const orchestrator = makeOrchestrator(
      makeConfig(),
      makeToolRegistry(),
      makeFlags(true)
    );

    await collect(
      orchestrator.run({
        ...baseInput,
        messages: [
          { role: 'user', content: 'first' },
          { role: 'assistant', content: 'second' },
          { role: 'user', content: 'third' },
        ],
      })
    );

    const opts = streamTextMock.mock.calls.at(-1)?.[0];
    expect(opts?.system).toMatchObject({
      role: 'system',
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    });
    const messages = opts?.messages as Record<string, unknown>[];
    expect(messages).toHaveLength(3);
    expect(messages[0]).not.toHaveProperty('providerOptions');
    expect(messages[1]).not.toHaveProperty('providerOptions');
    expect(messages[2]).toMatchObject({
      role: 'user',
      content: 'third',
      providerOptions: {
        anthropic: { cacheControl: { type: 'ephemeral' } },
      },
    });
  });

  it('sends a plain system string and unmarked messages when the flag is off', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementation(happyStream);
    const orchestrator = makeOrchestrator();

    await collect(orchestrator.run(baseInput));

    const opts = streamTextMock.mock.calls.at(-1)?.[0];
    expect(typeof opts?.system).toBe('string');
    const messages = opts?.messages as Record<string, unknown>[];
    for (const message of messages) {
      expect(message).not.toHaveProperty('providerOptions');
    }
  });

  it('does not cache on BYOK turns even when the flag is on', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementation(happyStream);
    const orchestrator = makeOrchestrator(
      makeConfig(),
      makeToolRegistry(),
      makeFlags(true)
    );

    await collect(orchestrator.run({ ...baseInput, byokApiKey: 'user-key' }));

    const opts = streamTextMock.mock.calls.at(-1)?.[0];
    expect(typeof opts?.system).toBe('string');
    const messages = opts?.messages as Record<string, unknown>[];
    for (const message of messages) {
      expect(message).not.toHaveProperty('providerOptions');
    }
  });

  it('treats a failing flag lookup as caching off', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementation(happyStream);
    const flags = {
      isEnabled: vi.fn().mockRejectedValue(new Error('redis down')),
    } as unknown as FeatureFlagsService;
    const orchestrator = makeOrchestrator(
      makeConfig(),
      makeToolRegistry(),
      flags
    );

    const events = await collect(orchestrator.run(baseInput));

    expect(events.at(-1)).toMatchObject({ type: 'done' });
    const opts = streamTextMock.mock.calls.at(-1)?.[0];
    expect(typeof opts?.system).toBe('string');
  });

  // The SDK rejects totalUsage only when no step completed. Attaching a no-op
  // handler keeps that rejection from surfacing as an unhandled rejection when
  // the turn fails over before awaiting it.
  function rejectedUsage(message: string) {
    const usage = Promise.reject(new Error(message));
    usage.catch(() => undefined);
    return usage;
  }

  it('completes the turn as done when an error part arrives after a step finished', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(
      (opts: {
        onStepFinish?: (s: {
          toolResults: unknown[];
          usage: { inputTokens: number; outputTokens: number };
        }) => void;
      }) => ({
        fullStream: (async function* () {
          opts.onStepFinish?.({
            toolResults: [],
            usage: { inputTokens: 5, outputTokens: 2 },
          });
          yield { type: 'text-delta', id: 't1', text: 'answer' };
          yield { type: 'error', error: new Error('late provider hiccup') };
        })(),
        totalUsage: Promise.resolve({
          inputTokens: 100,
          outputTokens: 10,
          inputTokenDetails: { cacheReadTokens: 60, cacheWriteTokens: 20 },
        }),
      })
    );
    const orchestrator = makeOrchestrator();

    const events = await collect(orchestrator.run(baseInput));

    expect(events).toContainEqual({ type: 'chunk', text: 'answer' });
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      usage: {
        inputTokens: 100,
        outputTokens: 10,
        cacheReadTokens: 60,
        cacheWriteTokens: 20,
        model: MODEL,
      },
    });
    expect(events.some((e) => (e as { type: string }).type === 'error')).toBe(
      false
    );
  });

  it('falls over to the next candidate and surfaces the provider message when an error part arrives with no completed step', async () => {
    streamTextMock.mockClear();
    streamTextMock
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield { type: 'error', error: new Error('upstream refused') };
        })(),
        totalUsage: rejectedUsage(
          'No output generated. Check the stream for errors.'
        ),
      }))
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', id: 't1', text: 'fallback answer' };
        })(),
        totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      }));
    const orchestrator = makeOrchestrator();

    const events = await collect(orchestrator.run(baseInput));

    expect(streamTextMock).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: 'chunk', text: 'fallback answer' });
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      usage: { model: FALLBACK },
    });
  });

  it('surfaces the provider error, not NoOutputGeneratedError, when the last candidate emits an error part with no completed step', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: 'error', error: new Error('upstream refused') };
      })(),
      totalUsage: rejectedUsage(
        'No output generated. Check the stream for errors.'
      ),
    }));
    const orchestrator = makeOrchestrator(
      makeConfig(),
      makeToolRegistry(),
      makeFlags(),
      ''
    );

    const events = await collect(orchestrator.run(baseInput));

    const error = (
      events.at(-1) as { error: { code: string; message: string } }
    ).error;
    expect(error.code).toBe('AI_PROVIDER_ERROR');
    expect(error.message).toContain('upstream refused');
    expect(error.message).not.toContain('No output generated');
  });

  it('keeps streaming text after a non-terminal error part and still ends the turn as done', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(
      (opts: {
        onStepFinish?: (s: {
          toolResults: unknown[];
          usage: { inputTokens: number; outputTokens: number };
        }) => void;
      }) => ({
        fullStream: (async function* () {
          opts.onStepFinish?.({
            toolResults: [],
            usage: { inputTokens: 2, outputTokens: 1 },
          });
          yield { type: 'text-delta', id: 't1', text: 'before' };
          yield { type: 'error', error: 'text part t9 not found' };
          yield { type: 'text-delta', id: 't1', text: ' after' };
        })(),
        totalUsage: Promise.resolve({ inputTokens: 7, outputTokens: 4 }),
      })
    );
    const orchestrator = makeOrchestrator();

    const events = await collect(orchestrator.run(baseInput));

    expect(events).toContainEqual({ type: 'chunk', text: 'before' });
    expect(events).toContainEqual({ type: 'chunk', text: ' after' });
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      usage: { inputTokens: 7, outputTokens: 4, model: MODEL },
    });
  });

  it('maps an error part carrying a transient statusCode to the overloaded code on the last candidate', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield {
          type: 'error',
          error: {
            name: 'APICallError',
            message: 'overloaded',
            statusCode: 503,
          },
        };
      })(),
      totalUsage: rejectedUsage(
        'No output generated. Check the stream for errors.'
      ),
    }));
    const orchestrator = makeOrchestrator(
      makeConfig(),
      makeToolRegistry(),
      makeFlags(),
      ''
    );

    const events = await collect(orchestrator.run(baseInput));

    const error = (
      events.at(-1) as { error: { code: string; message: string } }
    ).error;
    expect(error.code).toBe('AI_PROVIDER_OVERLOADED');
    expect(error.message).toContain('overloaded');
  });

  it('carries cache read/write tokens from totalUsage into the done event', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementation(() => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', id: 't1', text: 'Hello' };
      })(),
      totalUsage: Promise.resolve({
        inputTokens: 100,
        outputTokens: 10,
        inputTokenDetails: { cacheReadTokens: 60, cacheWriteTokens: 20 },
      }),
    }));
    const orchestrator = makeOrchestrator();

    const events = await collect(orchestrator.run(baseInput));

    expect(events.at(-1)).toMatchObject({
      type: 'done',
      usage: {
        inputTokens: 100,
        outputTokens: 10,
        cacheReadTokens: 60,
        cacheWriteTokens: 20,
        model: MODEL,
      },
    });
  });

  function healthLogsFrom(
    spy: ReturnType<typeof vi.spyOn>
  ): Record<string, unknown>[] {
    const calls = spy.mock.calls as unknown as unknown[][];
    return calls
      .map((call) => call[0])
      .filter(
        (entry): entry is Record<string, unknown> =>
          typeof entry === 'object' &&
          entry !== null &&
          (entry as { event?: string }).event === 'agent.turn.health'
      );
  }

  it('logs agent.turn.health with ttfp and part counts on a completed turn', async () => {
    streamTextMock.mockClear();
    // Leads with the SDK's local 'start' marker; parts must stay 3 (marker
    // excluded), not 4.
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: 'start' };
        yield { type: 'reasoning-delta', id: 'r1', text: 'pondering' };
        yield { type: 'text-delta', id: 't1', text: 'Hello' };
        yield { type: 'finish', finishReason: 'stop' };
      })(),
      totalUsage: Promise.resolve({ inputTokens: 3, outputTokens: 2 }),
    }));
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    const orchestrator = makeOrchestrator();

    await collect(orchestrator.run(baseInput));

    const healthLogs = healthLogsFrom(logSpy);
    expect(healthLogs).toHaveLength(1);
    expect(healthLogs[0]).toMatchObject({
      event: 'agent.turn.health',
      outcome: 'done',
      parts: 3,
      textDeltas: 1,
      finishReason: 'stop',
    });
    expect(healthLogs[0].ttfpMs).not.toBeNull();
    logSpy.mockRestore();
  });

  it('logs a stall health event for each silent attempt before failing over', async () => {
    vi.useFakeTimers();
    streamTextMock.mockClear();
    streamTextMock
      .mockImplementationOnce(hangingAfter([]))
      .mockImplementationOnce(hangingAfter([]));
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    const orchestrator = makeOrchestrator(
      makeConfig({ AI_AGENT_TTFT_MS: TTFT_MS }),
      makeToolRegistry(),
      makeFlags(),
      ''
    );

    const consumed = collect(orchestrator.run(baseInput));
    await vi.advanceTimersByTimeAsync(TTFT_MS);
    await vi.advanceTimersByTimeAsync(TTFT_MS);
    await consumed;

    const healthLogs = healthLogsFrom(logSpy);
    expect(healthLogs).toHaveLength(2);
    expect(healthLogs.every((entry) => entry.outcome === 'stall')).toBe(true);
    logSpy.mockRestore();
  });

  it('logs agent.turn.health exactly once per candidate attempt', async () => {
    streamTextMock.mockClear();
    streamTextMock
      .mockImplementationOnce(() => ({
        fullStream: {
          [Symbol.asyncIterator]: () => ({
            next: () => Promise.reject(new Error('primary down')),
          }),
        },
        totalUsage: new Promise(() => {}),
      }))
      .mockImplementationOnce(() => ({
        fullStream: (async function* () {
          yield { type: 'text-delta', id: 't1', text: 'Hello' };
          yield { type: 'finish', finishReason: 'stop' };
        })(),
        totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 1 }),
      }));
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    const orchestrator = makeOrchestrator();

    const events = await collect(orchestrator.run(baseInput));

    const healthLogs = healthLogsFrom(logSpy);
    expect(healthLogs).toHaveLength(2);
    expect(healthLogs.map((entry) => entry.outcome)).toEqual(['error', 'done']);
    expect(events.at(-1)).toMatchObject({ type: 'done' });
    logSpy.mockRestore();
  });

  it('logs a zero-activity health error and rethrows when tool setup rejects before the stream starts', async () => {
    streamTextMock.mockClear();
    const setupError = new Error('tool registry exploded');
    const registry = {
      resolve: vi.fn().mockRejectedValue(setupError),
    } as unknown as AgentToolRegistry;
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    const orchestrator = makeOrchestrator(
      makeConfig(),
      registry,
      makeFlags(),
      ''
    );

    await expect(collect(orchestrator.run(baseInput))).rejects.toBe(setupError);

    expect(streamTextMock).not.toHaveBeenCalled();
    const healthLogs = healthLogsFrom(logSpy);
    expect(healthLogs).toHaveLength(1);
    expect(healthLogs[0]).toMatchObject({
      event: 'agent.turn.health',
      outcome: 'error',
      parts: 0,
      ttfpMs: null,
    });
    logSpy.mockRestore();
  });

  it('logs agent.turn.health with outcome empty when a completed turn delivers no text', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: 'reasoning-delta', id: 'r1', text: 'thinking' };
        yield { type: 'finish', finishReason: 'stop' };
      })(),
      totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 0 }),
    }));
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    const orchestrator = makeOrchestrator();

    await collect(orchestrator.run(baseInput));

    const healthLogs = healthLogsFrom(logSpy);
    expect(healthLogs).toHaveLength(1);
    expect(healthLogs[0]).toMatchObject({
      event: 'agent.turn.health',
      outcome: 'empty',
      textDeltas: 0,
    });
    logSpy.mockRestore();
  });

  it('fails with AI_EMPTY_COMPLETION carrying usage when reasoning burns the whole budget and no text is produced', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: 'reasoning-delta', id: 'r1', text: 'thinking hard' };
        yield { type: 'reasoning-delta', id: 'r2', text: 'still thinking' };
        yield { type: 'finish', finishReason: 'length' };
      })(),
      totalUsage: Promise.resolve({ inputTokens: 10, outputTokens: 4096 }),
    }));
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    const orchestrator = makeOrchestrator(
      makeConfig(),
      makeToolRegistry(),
      makeFlags(),
      ''
    );

    const events = await collect(orchestrator.run(baseInput));

    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'AI_EMPTY_COMPLETION' },
      usage: { inputTokens: 10, outputTokens: 4096, model: MODEL },
    });
    expect(events.some((e) => (e as { type: string }).type === 'done')).toBe(
      false
    );

    const healthLogs = healthLogsFrom(logSpy);
    expect(healthLogs).toHaveLength(1);
    expect(healthLogs[0]).toMatchObject({
      event: 'agent.turn.health',
      outcome: 'empty',
      finishReason: 'length',
    });
    logSpy.mockRestore();
  });

  it('keeps a zero-text completion that finished on stop as a done, not an empty-completion error', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: 'reasoning-delta', id: 'r1', text: 'thinking' };
        yield { type: 'finish', finishReason: 'stop' };
      })(),
      totalUsage: Promise.resolve({ inputTokens: 1, outputTokens: 0 }),
    }));
    const orchestrator = makeOrchestrator();

    const events = await collect(orchestrator.run(baseInput));

    expect(events.at(-1)).toMatchObject({ type: 'done' });
    expect(events.some((e) => (e as { type: string }).type === 'error')).toBe(
      false
    );
  });

  it('yields the proposal (not an empty-completion error) when a no-text turn hits the length cap with a captured proposal', async () => {
    const m = ProposedMutation.create({
      id: 'p9',
      kind: 'create',
      payload: { title: 'GTD', contentHtml: '<p>x</p>' },
      summary: 'Create GTD',
    });
    if (m.isErr()) {
      throw new Error('setup');
    }
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: 'reasoning-delta', id: 'r1', text: 'deciding' };
        yield { type: 'finish', finishReason: 'length' };
      })(),
      totalUsage: Promise.resolve({ inputTokens: 2, outputTokens: 4096 }),
    }));
    const registry = makeToolRegistry((ctx) => {
      ctx.proposals.capture(m.value);
    });
    const orchestrator = makeOrchestrator(makeConfig(), registry);

    const events = await collect(orchestrator.run(baseInput));

    expect(events.at(-1)).toMatchObject({ type: 'proposal' });
    expect(events.some((e) => (e as { type: string }).type === 'error')).toBe(
      false
    );
  });

  it('records the openrouter upstream on the health event when a finish-step carries it', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', id: 't1', text: 'Hello' };
        yield {
          type: 'finish-step',
          finishReason: 'stop',
          providerMetadata: { openrouter: { provider: 'Fireworks' } },
        };
        yield { type: 'finish', finishReason: 'stop' };
      })(),
      totalUsage: Promise.resolve({ inputTokens: 3, outputTokens: 2 }),
    }));
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    const orchestrator = makeOrchestrator();

    await collect(
      orchestrator.run({ ...baseInput, model: 'openrouter:z-ai/glm-5.2' })
    );

    const healthLogs = healthLogsFrom(logSpy);
    expect(healthLogs).toHaveLength(1);
    expect(healthLogs[0]).toMatchObject({
      event: 'agent.turn.health',
      outcome: 'done',
      upstream: 'Fireworks',
    });
    logSpy.mockRestore();
  });

  it('records a null upstream on the health event when the stream carries no provider metadata', async () => {
    streamTextMock.mockClear();
    streamTextMock.mockImplementationOnce(() => ({
      fullStream: (async function* () {
        yield { type: 'text-delta', id: 't1', text: 'Hello' };
        yield { type: 'finish', finishReason: 'stop' };
      })(),
      totalUsage: Promise.resolve({ inputTokens: 3, outputTokens: 2 }),
    }));
    const logSpy = vi.spyOn(Logger.prototype, 'log');
    const orchestrator = makeOrchestrator();

    await collect(orchestrator.run(baseInput));

    const healthLogs = healthLogsFrom(logSpy);
    expect(healthLogs).toHaveLength(1);
    expect(healthLogs[0].upstream).toBeNull();
    logSpy.mockRestore();
  });
});
