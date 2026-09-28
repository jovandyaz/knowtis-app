import { simulateReadableStream, tool, type ToolModelMessage } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createExecutionContext } from '../../../ai/testing/create-execution-context';
import { createMockConfig } from '../../../ai/testing/create-mock-config';
import { createTestChain } from '../../../ai/testing/create-test-chain';
import type { AgentEvent } from '../../domain/agent-event';
import type { AgentMessage } from '../../domain/agent-message';
import { estimateMessageTokens } from '../../domain/message-tokens';
import type { AgentRunInput } from '../../domain/ports/agent-orchestrator.port';
import type { ConversationMessageRow } from '../../domain/ports/conversation.repository';
import { pruneTranscript } from '../../domain/prune-transcript';
import { buildTurnRows } from '../../domain/turn-transcript';
import { SYNTHESIS_REQUEST } from './agent-step-loop';
import { AgentToolRegistry } from './agent-tool.registry';
import { AiSdkAgentOrchestrator } from './ai-sdk-agent.orchestrator';
import { fromResponseMessages } from './message-mapper';
import { nextInputTokens } from './segment-close';

type StreamResult = Awaited<ReturnType<MockLanguageModelV4['doStream']>>;
type StreamPart =
  StreamResult['stream'] extends ReadableStream<infer P> ? P : never;
type FinishPart = Extract<StreamPart, { type: 'finish' }>;
type Usage = FinishPart['usage'];

const MODEL = 'anthropic:claude-sonnet-4-20250514';
const NOTE = {
  id: 'n1',
  title: 'Productivity',
  content: 'Take one step at a time.',
};
const ANSWER = 'Take one step at a time.';
const INPUT: AgentRunInput = {
  execution: createExecutionContext({ userId: 'fixture-user' }),
  model: MODEL,
  messages: [{ role: 'user', content: 'Read note n1 and summarize it.' }],
  maxSteps: 2,
  maxTurnTokens: 100,
};

const UNLIMITED = Number.POSITIVE_INFINITY;
const TOOL_RESULT_MESSAGE: ToolModelMessage = {
  role: 'tool',
  content: [
    {
      type: 'tool-result',
      toolCallId: 'read-n1',
      toolName: 'getNote',
      output: { type: 'json', value: NOTE },
    },
  ],
};
const TOOL_RESULT_TOKENS = nextInputTokens(
  0,
  0,
  fromResponseMessages([TOOL_RESULT_MESSAGE])
);
const SYNTHESIS_REQUEST_TOKENS = estimateMessageTokens({
  role: 'user',
  content: SYNTHESIS_REQUEST,
});

function usage(input: number | undefined, output: number | undefined): Usage {
  return {
    inputTokens: {
      total: input,
      noCache: input,
      cacheRead: 0,
      cacheWrite: 0,
    },
    outputTokens: { total: output, text: output, reasoning: 0 },
  };
}

function finish(
  reason: FinishPart['finishReason']['unified'],
  reported: Usage = usage(11, 7)
): FinishPart {
  return {
    type: 'finish',
    finishReason: { unified: reason, raw: reason },
    usage: reported,
  };
}

function response(chunks: StreamPart[]): StreamResult {
  return {
    stream: simulateReadableStream({
      chunks: [{ type: 'stream-start', warnings: [] }, ...chunks],
      initialDelayInMs: null,
      chunkDelayInMs: null,
    }),
  };
}

function toolResponse(reported?: Usage): StreamResult {
  return response([
    {
      type: 'tool-call',
      toolCallId: 'read-n1',
      toolName: 'getNote',
      input: '{"id":"n1"}',
    },
    finish('tool-calls', reported),
  ]);
}

function textResponse(reported?: Usage): StreamResult {
  return response([
    { type: 'text-start', id: 'answer' },
    { type: 'text-delta', id: 'answer', delta: ANSWER },
    { type: 'text-end', id: 'answer' },
    finish('stop', reported),
  ]);
}

function textUntilAborted(abortSignal: AbortSignal | undefined): StreamResult {
  return {
    stream: new ReadableStream<StreamPart>({
      start(controller) {
        controller.enqueue({ type: 'stream-start', warnings: [] });
        controller.enqueue({ type: 'text-start', id: 'answer' });
        controller.enqueue({ type: 'text-delta', id: 'answer', delta: ANSWER });
        abortSignal?.addEventListener(
          'abort',
          () => controller.error(abortSignal.reason),
          { once: true }
        );
      },
    }),
  };
}

function fixture(
  model: MockLanguageModelV4,
  overrides: Record<string, unknown> = {}
) {
  const config = createMockConfig({
    AI_AGENT_MAX_MS: 10000,
    AI_AGENT_STALL_MS: 5000,
    AI_AGENT_TTFT_MS: 1000,
    AI_AGENT_MAX_OUTPUT_TOKENS: 1000,
    AI_MAX_RETRIES: 0,
    AI_AGENT_SYNTHESIS_RESERVE_TOKENS: 1000,
    AI_AGENT_SYNTHESIS_RESERVE_MS: 1000,
    ...overrides,
  });
  const reads: string[] = [];
  const toolRegistry = new AgentToolRegistry([
    {
      name: 'fixture-notes',
      availableIn: () => true,
      build: () => ({
        getNote: tool({
          description: 'Read a fixture note.',
          inputSchema: z.object({ id: z.literal('n1') }),
          execute: async ({ id }) => {
            reads.push(id);
            return NOTE;
          },
        }),
      }),
    },
  ]);
  const { registry, chain } = createTestChain(config, '');
  vi.spyOn(registry, 'languageModel').mockReturnValue(model);
  const orchestrator = new AiSdkAgentOrchestrator(
    config,
    toolRegistry,
    registry,
    chain
  );
  return { orchestrator, reads };
}

async function collect(
  events: AsyncIterable<AgentEvent>
): Promise<AgentEvent[]> {
  const collected: AgentEvent[] = [];
  for await (const event of events) {
    collected.push(event);
  }
  return collected;
}

// Inputs are the history the loop predicts plus, on the synthesis, its
// request, and every call spends its whole output cap, so a total over the
// budget can only come from the loop's decisions.
async function runBudgetedTurn(
  maxTurnTokens: number,
  overrides: Record<string, unknown>
) {
  const reported: { input: number; output: number }[] = [];
  let lastStepRows: readonly AgentMessage[] = [];
  const model = new MockLanguageModelV4({
    doStream: async ({ toolChoice, maxOutputTokens }) => {
      const previous = reported.at(-1);
      const history = previous
        ? nextInputTokens(previous.input, previous.output, lastStepRows)
        : 300;
      const synthesis = toolChoice?.type === 'none';
      const input = synthesis ? history + SYNTHESIS_REQUEST_TOKENS : history;
      const output = maxOutputTokens ?? 0;
      reported.push({ input, output });
      return synthesis
        ? textResponse(usage(input, output))
        : toolResponse(usage(input, output));
    },
  });
  const { orchestrator } = fixture(model, {
    AI_AGENT_MAX_OUTPUT_TOKENS: 2048,
    AI_AGENT_SYNTHESIS_RESERVE_TOKENS: 3000,
    ...overrides,
  });
  const events: AgentEvent[] = [];
  for await (const event of orchestrator.run({
    ...INPUT,
    maxSteps: 8,
    maxTurnTokens,
  })) {
    events.push(event);
    if (event.type === 'step') {
      lastStepRows = event.messages;
    }
  }
  const spent = reported.reduce((sum, r) => sum + r.input + r.output, 0);
  return { model, events, spent };
}

describe('final-step turn through the real orchestrator and AI SDK', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads once, threads the result and answers in the second existing step', async () => {
    const model = new MockLanguageModelV4({
      doStream: async ({ toolChoice }) =>
        toolChoice?.type === 'none' ? textResponse() : toolResponse(),
    });
    const { orchestrator, reads } = fixture(model);

    const events = await collect(
      orchestrator.run({ ...INPUT, maxTurnTokens: UNLIMITED })
    );

    expect(reads).toEqual(['n1']);
    expect(model.doStreamCalls.map((call) => call.toolChoice)).toEqual([
      { type: 'auto' },
      { type: 'none' },
    ]);
    expect(model.doStreamCalls[1].prompt).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          role: 'tool',
          content: [
            expect.objectContaining({
              type: 'tool-result',
              toolCallId: 'read-n1',
              output: { type: 'json', value: NOTE },
            }),
          ],
        }),
      ])
    );
    expect(events.filter((event) => event.type === 'chunk')).toEqual([
      { type: 'chunk', text: ANSWER },
    ]);
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      stopReason: 'max_steps',
      sources: [{ id: 'n1', title: 'Productivity' }],
      usage: { inputTokens: 22, outputTokens: 14, model: MODEL },
    });
  });

  it('uses its only allowed step for text and never runs a tool', async () => {
    const model = new MockLanguageModelV4({
      doStream: async ({ toolChoice }) =>
        toolChoice?.type === 'none' ? textResponse() : toolResponse(),
    });
    const { orchestrator, reads } = fixture(model);

    const events = await collect(orchestrator.run({ ...INPUT, maxSteps: 1 }));

    expect(model.doStreamCalls).toHaveLength(1);
    expect(reads).toEqual([]);
    expect(events.filter((event) => event.type === 'chunk')).toEqual([
      { type: 'chunk', text: ANSWER },
    ]);
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      stopReason: 'completed',
    });
  });

  it('closes a step-capped turn with a tool-less synthesis that reports max_steps', async () => {
    let call = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => (call++ === 0 ? toolResponse() : textResponse()),
    });
    const { orchestrator } = fixture(model);

    const events = await collect(
      orchestrator.run({ ...INPUT, maxTurnTokens: UNLIMITED })
    );

    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls[1].toolChoice).toEqual({ type: 'none' });
    expect(model.doStreamCalls[1].prompt.at(-1)).toMatchObject({
      role: 'user',
      content: [{ type: 'text', text: SYNTHESIS_REQUEST }],
    });
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      stopReason: 'max_steps',
    });
    expect(events.filter((event) => event.type === 'chunk')).toEqual([
      { type: 'chunk', text: ANSWER },
    ]);
  });

  it('never persists the synthesis instruction', async () => {
    let call = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => (call++ === 0 ? toolResponse() : textResponse()),
    });
    const { orchestrator } = fixture(model);

    const events = await collect(
      orchestrator.run({ ...INPUT, maxTurnTokens: UNLIMITED })
    );

    const stepMessages = events.flatMap((event) =>
      event.type === 'step' ? event.messages : []
    );
    expect(stepMessages).toHaveLength(3);
    expect(JSON.stringify(events)).not.toContain(SYNTHESIS_REQUEST);
  });

  it('closes on the token budget with the synthesis output capped to the room left', async () => {
    let call = 0;
    const model = new MockLanguageModelV4({
      doStream: async () =>
        call++ === 0 ? toolResponse(usage(600, 100)) : textResponse(),
    });
    const { orchestrator } = fixture(model, {
      AI_AGENT_MAX_OUTPUT_TOKENS: 4096,
      AI_AGENT_SYNTHESIS_RESERVE_TOKENS: 4096,
    });
    const spent = 700;
    const nextInput = spent + TOOL_RESULT_TOKENS;
    const room = 1500;
    // One more tool step and the synthesis would pass it:
    // spent + 2 × nextInput + the request + the 4096 reserve > budget.
    const budget = spent + nextInput + SYNTHESIS_REQUEST_TOKENS + room;

    const events = await collect(
      orchestrator.run({ ...INPUT, maxSteps: 8, maxTurnTokens: budget })
    );

    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls[1].toolChoice).toEqual({ type: 'none' });
    expect(model.doStreamCalls[1].maxOutputTokens).toBe(room);
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      stopReason: 'token_budget',
    });
  });

  it('closes on the segment clock and reports time_limit', async () => {
    let call = 0;
    const model = new MockLanguageModelV4({
      doStream: async () => {
        if (call++ > 0) {
          return textResponse();
        }
        // The clock must pass deadline − reserve, 1 ms after the turn starts.
        await new Promise((resolve) => setTimeout(resolve, 5));
        return toolResponse();
      },
    });
    const { orchestrator } = fixture(model, {
      AI_AGENT_MAX_MS: 10000,
      AI_AGENT_SYNTHESIS_RESERVE_MS: 9999,
    });

    const events = await collect(
      orchestrator.run({ ...INPUT, maxSteps: 8, maxTurnTokens: UNLIMITED })
    );

    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls[1].toolChoice).toEqual({ type: 'none' });
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      stopReason: 'time_limit',
    });
  });

  it('does not buy a text step after the first tool step spends the token budget', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => toolResponse(),
    });
    const { orchestrator, reads } = fixture(model);

    const events = await collect(
      orchestrator.run({ ...INPUT, maxTurnTokens: 18 })
    );

    expect(model.doStreamCalls).toHaveLength(1);
    expect(reads).toEqual(['n1']);
    expect(events.filter((event) => event.type === 'chunk')).toEqual([]);
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      stopReason: 'token_budget',
      usage: { inputTokens: 11, outputTokens: 7 },
    });
  });

  it('ends without an extra call when the synthesis call still asks for tools', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => toolResponse(),
    });
    const { orchestrator } = fixture(model);

    const events = await collect(
      orchestrator.run({ ...INPUT, maxTurnTokens: UNLIMITED })
    );

    expect(model.doStreamCalls).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      stopReason: 'max_steps',
    });
  });

  it('answers plainly when only one step is allowed', async () => {
    const model = new MockLanguageModelV4({
      doStream: async () => textResponse(),
    });
    const { orchestrator } = fixture(model);

    const events = await collect(orchestrator.run({ ...INPUT, maxSteps: 1 }));

    expect(model.doStreamCalls).toHaveLength(1);
    expect(JSON.stringify(model.doStreamCalls[0].prompt)).not.toContain(
      SYNTHESIS_REQUEST
    );
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      stopReason: 'completed',
    });
  });

  it('keeps stepping when a tool step reports no usage', async () => {
    let call = 0;
    const model = new MockLanguageModelV4({
      doStream: async () =>
        call++ === 0
          ? toolResponse(usage(undefined, undefined))
          : textResponse(),
    });
    const { orchestrator } = fixture(model);

    const events = await collect(
      orchestrator.run({ ...INPUT, maxSteps: 3, maxTurnTokens: 100_000 })
    );

    expect(model.doStreamCalls.map((c) => c.toolChoice)).toEqual([
      { type: 'auto' },
      { type: 'auto' },
    ]);
    expect(events.at(-1)).toMatchObject({
      type: 'done',
      stopReason: 'completed',
    });
  });

  it.each([
    {
      budget: 3_000,
      toolSteps: 1,
      synthesis: false,
      stopReason: 'token_budget',
    },
    {
      budget: 6_000,
      toolSteps: 1,
      synthesis: true,
      stopReason: 'token_budget',
    },
    {
      budget: 8_000,
      toolSteps: 1,
      synthesis: true,
      stopReason: 'token_budget',
    },
    {
      budget: 12_000,
      toolSteps: 2,
      synthesis: false,
      stopReason: 'token_budget',
    },
    {
      budget: 15_000,
      toolSteps: 2,
      synthesis: true,
      stopReason: 'token_budget',
    },
    {
      budget: 60_000,
      toolSteps: 6,
      synthesis: true,
      stopReason: 'token_budget',
    },
    { budget: 100_000, toolSteps: 7, synthesis: true, stopReason: 'max_steps' },
  ])(
    'stays within a $budget-token budget and ends with $stopReason',
    async ({ budget, toolSteps, synthesis, stopReason }) => {
      const { model, events, spent } = await runBudgetedTurn(budget, {});

      expect(spent).toBeLessThanOrEqual(budget);
      expect(model.doStreamCalls.map((call) => call.toolChoice)).toEqual([
        ...Array.from({ length: toolSteps }, () => ({ type: 'auto' })),
        ...(synthesis ? [{ type: 'none' }] : []),
      ]);
      const done = events.at(-1);
      if (done?.type !== 'done') {
        throw new Error('Expected the turn to end with done');
      }
      expect(done.stopReason).toBe(stopReason);
      expect(done.usage.inputTokens + done.usage.outputTokens).toBe(spent);
    }
  );

  it.each([
    { budget: 10_000, calls: 2 },
    { budget: 6_000, calls: 2 },
    { budget: 3_000, calls: 1 },
  ])(
    'ends a $budget-token turn below the synthesis reserve on token_budget after $calls call(s)',
    async ({ budget, calls }) => {
      const { model, events, spent } = await runBudgetedTurn(budget, {
        AI_AGENT_SYNTHESIS_RESERVE_TOKENS: 12_000,
      });

      expect(model.doStreamCalls).toHaveLength(calls);
      expect(spent).toBeLessThanOrEqual(budget);
      expect(events.at(-1)).toMatchObject({
        type: 'done',
        stopReason: 'token_budget',
      });
    }
  );

  it('ends with the timeout error when the clock runs out during the synthesis', async () => {
    let call = 0;
    const model = new MockLanguageModelV4({
      doStream: async ({ abortSignal }) =>
        call++ === 0 ? toolResponse() : textUntilAborted(abortSignal),
    });
    const { orchestrator } = fixture(model, {
      AI_AGENT_MAX_MS: 1500,
      AI_AGENT_SYNTHESIS_RESERVE_MS: 1499,
      AI_AGENT_STALL_MS: 5000,
      AI_AGENT_TTFT_MS: 1000,
    });

    const events = await collect(
      orchestrator.run({ ...INPUT, maxTurnTokens: UNLIMITED })
    );

    expect(model.doStreamCalls).toHaveLength(2);
    expect(model.doStreamCalls[1].toolChoice).toEqual({ type: 'none' });
    expect(events).toContainEqual({ type: 'chunk', text: ANSWER });
    expect(events.at(-1)).toMatchObject({
      type: 'error',
      error: { code: 'AI_TIMEOUT' },
    });
  });

  it('replays a capped tool turn without its metadata-only notice into the next SDK call', async () => {
    let requestCount = 0;
    const model = new MockLanguageModelV4({
      doStream: async () =>
        requestCount++ === 0 ? toolResponse() : textResponse(),
    });
    const { orchestrator } = fixture(model);

    const events = await collect(orchestrator.run({ ...INPUT, maxSteps: 1 }));
    const terminal = events.at(-1);
    if (terminal?.type !== 'done') {
      throw new Error('Expected a completed capped turn');
    }
    const rows = buildTurnRows({
      userContent: 'Read note n1.',
      turnMessages: events.flatMap((event) =>
        event.type === 'step' ? event.messages : []
      ),
      assistantText: '',
      sources: terminal.sources,
      stopReason: terminal.stopReason,
    });

    expect(model.doStreamCalls).toHaveLength(1);
    expect(terminal.stopReason).toBe('max_steps');
    expect(rows.map((row) => row.role)).toEqual([
      'user',
      'assistant',
      'tool',
      'assistant',
    ]);
    expect(rows[2].parts).toEqual([
      {
        type: 'tool-result',
        toolCallId: 'read-n1',
        toolName: 'getNote',
        output: NOTE,
        outputType: 'json',
      },
    ]);
    expect(rows[3]).toEqual({
      role: 'assistant',
      content: '',
      sources: [{ id: 'n1', title: 'Productivity' }],
      stopReason: 'max_steps',
    });

    const storedRows: ConversationMessageRow[] = rows.map((row) => ({
      ...row,
      parts: row.parts ?? null,
      sources: row.sources ?? [],
      stopReason: row.stopReason ?? null,
      turnId: 'fixture-turn',
      kind: row.kind ?? null,
    }));
    const nextEvents = await collect(
      orchestrator.run({
        ...INPUT,
        maxSteps: 1,
        messages: [
          ...pruneTranscript(storedRows, { keepToolTurns: 2 }),
          { role: 'user', content: 'Summarize the note you read.' },
        ],
      })
    );

    expect(model.doStreamCalls).toHaveLength(2);
    expect(
      model.doStreamCalls[1].prompt.filter(
        (message) => message.role !== 'system'
      )
    ).toEqual([
      { role: 'user', content: [{ type: 'text', text: 'Read note n1.' }] },
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'read-n1',
            toolName: 'getNote',
            input: { id: 'n1' },
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'read-n1',
            toolName: 'getNote',
            output: { type: 'json', value: NOTE },
          },
        ],
      },
      {
        role: 'user',
        content: [{ type: 'text', text: 'Summarize the note you read.' }],
        providerOptions: {
          anthropic: { cacheControl: { type: 'ephemeral' } },
        },
      },
    ]);
    expect(nextEvents.at(-1)).toMatchObject({
      type: 'done',
      stopReason: 'completed',
    });
    expect(nextEvents.filter((event) => event.type === 'chunk')).toEqual([
      { type: 'chunk', text: ANSWER },
    ]);
  });
});
