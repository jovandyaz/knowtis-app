import { simulateReadableStream } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import type { ZodType } from 'zod';

import type {
  AIStructuredOutputProvider,
  StructuredOutputOptions,
  StructuredOutputResult,
} from '../../ai/domain/ports/ai-structured-output.port';

type CallOptions = Parameters<MockLanguageModelV4['doStream']>[0];
type StreamResult = Awaited<ReturnType<MockLanguageModelV4['doStream']>>;
type StreamPart =
  StreamResult['stream'] extends ReadableStream<infer P> ? P : never;
type PromptMessage = CallOptions['prompt'][number];

const ANSWER_PART_ID = 'answer';
const STEP_USAGE = {
  inputTokens: { total: 20, noCache: 20, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};
const STRUCTURED_TOKENS = 1;

export interface ScriptedToolCall {
  readonly name: string;
  readonly input: unknown;
}

/** One model call: the text it streams, then the tool calls it makes, in order. */
export interface ScriptedStep {
  readonly text?: string;
  readonly toolCalls?: readonly ScriptedToolCall[];
}

export interface SeenToolResult {
  readonly toolName: string;
  /** The value the model read: the JSON or text of the result, or the raw output for any other kind. */
  readonly output: unknown;
}

/** What the model received on one call. */
export interface ScriptedCall {
  readonly toolNames: readonly string[];
  /** Every tool result in the prompt, oldest first. */
  readonly toolResults: readonly SeenToolResult[];
  /** Everything the prompt says, tool calls and results included, as one string. */
  readonly text: string;
}

/** A step, or a function that picks it from what the model has received so far. */
export type ScriptEntry = ScriptedStep | ((call: ScriptedCall) => ScriptedStep);

export interface ScriptedModel {
  readonly model: MockLanguageModelV4;
  readonly calls: readonly ScriptedCall[];
}

function seenOutput(output: unknown): unknown {
  if (typeof output === 'object' && output !== null && 'value' in output) {
    return output.value;
  }
  return output;
}

function toolResultsOf(message: PromptMessage): SeenToolResult[] {
  if (message.role !== 'tool' && message.role !== 'assistant') {
    return [];
  }
  return message.content.flatMap((part) =>
    part.type === 'tool-result'
      ? [{ toolName: part.toolName, output: seenOutput(part.output) }]
      : []
  );
}

function textOf(message: PromptMessage): string {
  if (message.role === 'system') {
    return message.content;
  }
  return message.content
    .map((part) => {
      switch (part.type) {
        case 'text':
        case 'reasoning':
          return part.text;
        case 'tool-call':
          return JSON.stringify(part.input);
        case 'tool-result':
          return JSON.stringify(part.output);
        default:
          return '';
      }
    })
    .join('\n');
}

function callOf(options: CallOptions): ScriptedCall {
  return {
    toolNames: (options.tools ?? []).map((tool) => tool.name),
    toolResults: options.prompt.flatMap(toolResultsOf),
    text: options.prompt.map(textOf).join('\n'),
  };
}

function partsOf(step: ScriptedStep, callIndex: number): StreamPart[] {
  const toolCalls = step.toolCalls ?? [];
  const answer: StreamPart[] = step.text
    ? [
        { type: 'text-start', id: ANSWER_PART_ID },
        { type: 'text-delta', id: ANSWER_PART_ID, delta: step.text },
        { type: 'text-end', id: ANSWER_PART_ID },
      ]
    : [];
  const reason = toolCalls.length > 0 ? 'tool-calls' : 'stop';
  return [
    { type: 'stream-start', warnings: [] },
    ...answer,
    ...toolCalls.map(
      (call, i): StreamPart => ({
        type: 'tool-call',
        toolCallId: `call-${callIndex + 1}-${i + 1}`,
        toolName: call.name,
        input: JSON.stringify(call.input),
      })
    ),
    {
      type: 'finish',
      finishReason: { unified: reason, raw: reason },
      usage: STEP_USAGE,
    },
  ];
}

/**
 * A model that plays `script` one entry per call and records what each call received. A call past
 * the end of the script throws, so a loop that keeps calling after it should have stopped fails
 * the turn instead of passing.
 */
export function scriptedModel(script: readonly ScriptEntry[]): ScriptedModel {
  const calls: ScriptedCall[] = [];
  const model = new MockLanguageModelV4({
    doStream: async (options) => {
      const call = callOf(options);
      calls.push(call);
      const entry = script[calls.length - 1];
      if (entry === undefined) {
        throw new Error(
          `Unexpected model call #${calls.length}: the script has ${script.length}`
        );
      }
      const step = typeof entry === 'function' ? entry(call) : entry;
      return {
        stream: simulateReadableStream({
          chunks: partsOf(step, calls.length - 1),
          initialDelayInMs: null,
          chunkDelayInMs: null,
        }),
      };
    },
  });
  return { model, calls };
}

/** The last result of `toolName` the model received, or undefined. */
export function lastResultOf(call: ScriptedCall, toolName: string): unknown {
  return call.toolResults.findLast((result) => result.toolName === toolName)
    ?.output;
}

export interface ScriptedStructuredOutput {
  readonly provider: AIStructuredOutputProvider;
  readonly prompts: readonly string[];
}

/** An `AI_STRUCTURED_OUTPUT_PROVIDER` that answers every call with `object`, parsed by the caller's schema, and records each prompt. */
export function scriptedStructuredOutput(
  object: unknown
): ScriptedStructuredOutput {
  const prompts: string[] = [];
  const provider: AIStructuredOutputProvider = {
    generateStructuredOutput: <T>(
      prompt: string,
      schema: ZodType<T>,
      options: StructuredOutputOptions
    ): Promise<StructuredOutputResult<T>> => {
      prompts.push(prompt);
      return Promise.resolve({
        object: schema.parse(object),
        inputTokens: STRUCTURED_TOKENS,
        outputTokens: STRUCTURED_TOKENS,
        model: options.model,
      });
    },
  };
  return { provider, prompts };
}
