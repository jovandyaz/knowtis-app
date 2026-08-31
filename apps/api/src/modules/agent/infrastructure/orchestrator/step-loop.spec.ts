import type { ModelMessage, StepResult, ToolSet } from 'ai';
import { isStepCount, simulateReadableStream, streamText, tool } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

type StreamResult = Awaited<ReturnType<MockLanguageModelV3['doStream']>>;
type StreamPart = StreamResult extends { stream: ReadableStream<infer P> }
  ? P
  : never;
type FinishPart = Extract<StreamPart, { type: 'finish' }>;
type FinishReason = FinishPart['finishReason'];
type StreamUsage = FinishPart['usage'];

const USER_PROMPT = 'lee la nota n1';
const TOOL_NAME = 'getNote';
const TOOL_CALL_ID = 'call-1';
const NOTE_ID = 'n1';
const NOTE = { id: NOTE_ID, title: 'Productividad', content: 'gtd' };
const ANSWER = 'Tu nota trata de productividad.';

const STEP1_INPUT_TOKENS = 11;
const STEP1_OUTPUT_TOKENS = 7;
const STEP2_INPUT_TOKENS = 23;
const STEP2_OUTPUT_TOKENS = 5;

const TOOL_CALLS: FinishReason = { unified: 'tool-calls', raw: 'tool_calls' };
const STOP: FinishReason = { unified: 'stop', raw: 'stop' };

function usage(input: number, output: number): StreamUsage {
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

function streamOf(chunks: StreamPart[]): StreamResult {
  return { stream: simulateReadableStream({ chunks }) };
}

function toolCallStream(): StreamResult {
  return streamOf([
    { type: 'stream-start', warnings: [] },
    {
      type: 'tool-call',
      toolCallId: TOOL_CALL_ID,
      toolName: TOOL_NAME,
      input: JSON.stringify({ id: NOTE_ID }),
    },
    {
      type: 'finish',
      finishReason: TOOL_CALLS,
      usage: usage(STEP1_INPUT_TOKENS, STEP1_OUTPUT_TOKENS),
    },
  ]);
}

function answerStream(): StreamResult {
  return streamOf([
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 't1' },
    { type: 'text-delta', id: 't1', delta: ANSWER },
    { type: 'text-end', id: 't1' },
    {
      type: 'finish',
      finishReason: STOP,
      usage: usage(STEP2_INPUT_TOKENS, STEP2_OUTPUT_TOKENS),
    },
  ]);
}

function makeTools() {
  const execute = vi.fn(async ({ id }: { id: string }) => ({ ...NOTE, id }));
  const tools = {
    [TOOL_NAME]: tool({
      description: 'Read a note by id.',
      inputSchema: z.object({ id: z.string() }),
      execute,
    }),
  } satisfies ToolSet;
  return { tools, execute };
}

type SpikeTools = ReturnType<typeof makeTools>['tools'];

async function drain<T>(stream: AsyncIterable<T>): Promise<T[]> {
  const parts: T[] = [];
  for await (const part of stream) {
    parts.push(part);
  }
  return parts;
}

interface ContentPart {
  type: string;
}
function contentParts(message: ModelMessage): ContentPart[] {
  return Array.isArray(message.content)
    ? (message.content as ContentPart[])
    : [];
}

describe('step-loop SDK contract', () => {
  it('runs exactly one model call and executes the tool inside it under isStepCount(1)', async () => {
    const { tools, execute } = makeTools();
    const model = new MockLanguageModelV3({
      doStream: async () => toolCallStream(),
    });

    const result = streamText({
      model,
      tools,
      stopWhen: isStepCount(1),
      messages: [{ role: 'user', content: USER_PROMPT }],
    });
    const parts = await drain(result.stream);

    expect(model.doStreamCalls).toHaveLength(1);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(execute).toHaveBeenCalledWith(
      { id: NOTE_ID },
      expect.objectContaining({ toolCallId: TOOL_CALL_ID })
    );

    const steps = await result.steps;
    expect(steps).toHaveLength(1);
    expect(steps[0].toolCalls.map((c) => c.toolName)).toEqual([TOOL_NAME]);
    expect(steps[0].toolResults.map((r) => r.output)).toEqual([{ ...NOTE }]);

    const toolResultParts = parts.filter((p) => p.type === 'tool-result');
    expect(toolResultParts).toHaveLength(1);
    expect(parts.filter((p) => p.type === 'error')).toHaveLength(0);
  });

  it('exposes the assistant tool-call message and the tool-result message on response.messages', async () => {
    const { tools } = makeTools();
    const model = new MockLanguageModelV3({
      doStream: async () => toolCallStream(),
    });

    const result = streamText({
      model,
      tools,
      stopWhen: isStepCount(1),
      messages: [{ role: 'user', content: USER_PROMPT }],
    });
    await drain(result.stream);

    const { messages } = await result.response;
    expect(messages.map((m) => m.role)).toEqual(['assistant', 'tool']);

    const [assistant, toolMessage] = messages;
    const toolCallParts = contentParts(assistant).filter(
      (p) => p.type === 'tool-call'
    );
    expect(toolCallParts).toHaveLength(1);
    expect(toolCallParts[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: TOOL_CALL_ID,
      toolName: TOOL_NAME,
      input: { id: NOTE_ID },
    });

    const toolResultParts = contentParts(toolMessage).filter(
      (p) => p.type === 'tool-result'
    );
    expect(toolResultParts).toHaveLength(1);
    expect(toolResultParts[0]).toMatchObject({
      type: 'tool-result',
      toolCallId: TOOL_CALL_ID,
      toolName: TOOL_NAME,
      output: { type: 'json', value: { ...NOTE } },
    });

    const history: ModelMessage[] = [{ role: 'user', content: USER_PROMPT }];
    history.push(...messages);
    expect(history).toHaveLength(3);
  });

  it('threads the prior tool call and result into a second call without re-executing the tool', async () => {
    const { tools, execute } = makeTools();
    const model1 = new MockLanguageModelV3({
      doStream: async () => toolCallStream(),
    });

    const first = streamText({
      model: model1,
      tools,
      stopWhen: isStepCount(1),
      messages: [{ role: 'user', content: USER_PROMPT }],
    });
    await drain(first.stream);
    expect(execute).toHaveBeenCalledTimes(1);

    const { messages: firstMessages } = await first.response;
    const history: ModelMessage[] = [
      { role: 'user', content: USER_PROMPT },
      ...firstMessages,
    ];

    const model2 = new MockLanguageModelV3({
      doStream: async () => answerStream(),
    });
    const second = streamText({
      model: model2,
      tools,
      stopWhen: isStepCount(1),
      messages: history,
    });
    await drain(second.stream);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(model2.doStreamCalls).toHaveLength(1);

    const prompt = model2.doStreamCalls[0].prompt;
    const promptToolCalls = prompt.flatMap((m) =>
      Array.isArray(m.content)
        ? (m.content as ContentPart[]).filter((p) => p.type === 'tool-call')
        : []
    );
    const promptToolResults = prompt.flatMap((m) =>
      Array.isArray(m.content)
        ? (m.content as ContentPart[]).filter((p) => p.type === 'tool-result')
        : []
    );
    expect(promptToolCalls).toHaveLength(1);
    expect(promptToolCalls[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: TOOL_CALL_ID,
      toolName: TOOL_NAME,
    });
    expect(promptToolResults).toHaveLength(1);
    expect(promptToolResults[0]).toMatchObject({
      type: 'tool-result',
      toolCallId: TOOL_CALL_ID,
      toolName: TOOL_NAME,
    });

    expect(await second.text).toBe(ANSWER);
  });

  it('fires onStepEnd once per streamText call with that call usage', async () => {
    const { tools } = makeTools();

    const firstSteps: StepResult<SpikeTools>[] = [];
    const model1 = new MockLanguageModelV3({
      doStream: async () => toolCallStream(),
    });
    const first = streamText({
      model: model1,
      tools,
      stopWhen: isStepCount(1),
      messages: [{ role: 'user', content: USER_PROMPT }],
      onStepEnd: (step) => {
        firstSteps.push(step);
      },
    });
    await drain(first.stream);

    expect(firstSteps).toHaveLength(1);
    expect(firstSteps[0].usage.inputTokens).toBe(STEP1_INPUT_TOKENS);
    expect(firstSteps[0].usage.outputTokens).toBe(STEP1_OUTPUT_TOKENS);

    const { messages: firstMessages } = await first.response;
    const secondSteps: StepResult<SpikeTools>[] = [];
    const model2 = new MockLanguageModelV3({
      doStream: async () => answerStream(),
    });
    const second = streamText({
      model: model2,
      tools,
      stopWhen: isStepCount(1),
      messages: [{ role: 'user', content: USER_PROMPT }, ...firstMessages],
      onStepEnd: (step) => {
        secondSteps.push(step);
      },
    });
    await drain(second.stream);

    expect(secondSteps).toHaveLength(1);
    expect(secondSteps[0].usage.inputTokens).toBe(STEP2_INPUT_TOKENS);
    expect(secondSteps[0].usage.outputTokens).toBe(STEP2_OUTPUT_TOKENS);
  });
});
