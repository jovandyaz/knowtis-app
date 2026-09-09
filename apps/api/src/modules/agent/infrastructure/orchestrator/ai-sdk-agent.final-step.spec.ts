import { simulateReadableStream, tool } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { createMockConfig } from '../../../ai/testing/create-mock-config';
import { createTestChain } from '../../../ai/testing/create-test-chain';
import type { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import type { AgentEvent } from '../../domain/agent-event';
import type { AgentRunInput } from '../../domain/ports/agent-orchestrator.port';
import type { ConversationMessageRow } from '../../domain/ports/conversation.repository';
import { pruneTranscript } from '../../domain/prune-transcript';
import { buildTurnRows } from '../../domain/turn-transcript';
import { AgentToolRegistry } from './agent-tool.registry';
import { AiSdkAgentOrchestrator } from './ai-sdk-agent.orchestrator';

type StreamResult = Awaited<ReturnType<MockLanguageModelV4['doStream']>>;
type StreamPart =
  StreamResult['stream'] extends ReadableStream<infer P> ? P : never;
type FinishPart = Extract<StreamPart, { type: 'finish' }>;

const MODEL = 'anthropic:claude-sonnet-4-20250514';
const NOTE = {
  id: 'n1',
  title: 'Productivity',
  content: 'Take one step at a time.',
};
const ANSWER = 'Take one step at a time.';
const INPUT: AgentRunInput = {
  userId: 'fixture-user',
  model: MODEL,
  messages: [{ role: 'user', content: 'Read note n1 and summarize it.' }],
  maxSteps: 2,
  maxTurnTokens: 100,
};

function finish(reason: FinishPart['finishReason']['unified']): FinishPart {
  return {
    type: 'finish',
    finishReason: { unified: reason, raw: reason },
    usage: {
      inputTokens: { total: 11, noCache: 11, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 7, text: 7, reasoning: 0 },
    },
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

function toolResponse(): StreamResult {
  return response([
    {
      type: 'tool-call',
      toolCallId: 'read-n1',
      toolName: 'getNote',
      input: '{"id":"n1"}',
    },
    finish('tool-calls'),
  ]);
}

function textResponse(): StreamResult {
  return response([
    { type: 'text-start', id: 'answer' },
    { type: 'text-delta', id: 'answer', delta: ANSWER },
    { type: 'text-end', id: 'answer' },
    finish('stop'),
  ]);
}

function fixture(model: MockLanguageModelV4) {
  const config = createMockConfig({
    AI_AGENT_MAX_MS: 10000,
    AI_AGENT_STALL_MS: 5000,
    AI_AGENT_TTFT_MS: 1000,
    AI_AGENT_MAX_OUTPUT_TOKENS: 1024,
    AI_MAX_RETRIES: 0,
  });
  const flags = {
    isEnabled: vi.fn().mockResolvedValue(false),
  } as unknown as FeatureFlagsService;
  const reads: string[] = [];
  const toolRegistry = new AgentToolRegistry(
    [
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
    ],
    flags
  );
  const { registry, chain } = createTestChain(config, '');
  vi.spyOn(registry, 'languageModel').mockReturnValue(model);
  const orchestrator = new AiSdkAgentOrchestrator(
    config,
    toolRegistry,
    registry,
    chain,
    flags
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

describe('final-step turn through the real orchestrator and AI SDK', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads once, threads the result and answers in the second existing step', async () => {
    const model = new MockLanguageModelV4({
      doStream: async ({ toolChoice }) =>
        toolChoice?.type === 'none' ? textResponse() : toolResponse(),
    });
    const { orchestrator, reads } = fixture(model);

    const events = await collect(orchestrator.run(INPUT));

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
      stopReason: 'completed',
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
