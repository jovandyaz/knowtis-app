import type {
  AssistantModelMessage,
  ModelMessage,
  ToolModelMessage,
  ToolResultPart,
} from 'ai';

import {
  textOfParts,
  type AgentMessage,
  type AgentMessagePart,
  type AgentToolResultPart,
} from '../../domain/agent-message';

export type ResponseMessage = AssistantModelMessage | ToolModelMessage;

type AssistantPart = Exclude<AssistantModelMessage['content'], string>[number];
type ToolResultOutput = ToolResultPart['output'];
type ToolResultJsonValue = Extract<ToolResultOutput, { type: 'json' }>['value'];
type ToolResultContentValue = Extract<
  ToolResultOutput,
  { type: 'content' }
>['value'];

const EXECUTION_DENIED_FALLBACK = 'execution denied';

function fromAssistant(message: AssistantModelMessage): AgentMessage {
  if (typeof message.content === 'string') {
    return { role: 'assistant', content: message.content };
  }

  const parts: AgentMessagePart[] = [];
  for (const part of message.content) {
    if (part.type === 'text') {
      parts.push({ type: 'text', text: part.text });
    } else if (part.type === 'tool-call') {
      parts.push({
        type: 'tool-call',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        input: part.input,
      });
    }
  }

  const content = textOfParts(parts);
  return parts.some((part) => part.type === 'tool-call')
    ? { role: 'assistant', content, parts }
    : { role: 'assistant', content };
}

function fromToolOutput(
  output: ToolResultOutput
): Pick<AgentToolResultPart, 'output' | 'outputType'> {
  switch (output.type) {
    case 'text':
    case 'json':
    case 'content':
    case 'error-text':
    case 'error-json':
      return { output: output.value, outputType: output.type };
    case 'execution-denied':
      return {
        output: output.reason ?? EXECUTION_DENIED_FALLBACK,
        outputType: output.type,
      };
    default: {
      const unsupported: never = output;
      return unsupported;
    }
  }
}

function fromTool(message: ToolModelMessage): AgentMessage {
  const parts: AgentMessagePart[] = [];
  for (const part of message.content) {
    if (part.type === 'tool-result') {
      parts.push({
        type: 'tool-result',
        toolCallId: part.toolCallId,
        toolName: part.toolName,
        ...fromToolOutput(part.output),
      });
    }
  }
  return parts.length > 0
    ? { role: 'tool', content: '', parts }
    : { role: 'tool', content: '' };
}

function carriesTranscript(message: AgentMessage): boolean {
  return message.content !== '' || (message.parts?.length ?? 0) > 0;
}

/**
 * Domain view of one step's `response.messages`; reasoning, file and approval parts are dropped,
 * and a message left with neither text nor parts is omitted so no empty row reaches the transcript.
 */
export function fromResponseMessages(
  messages: readonly ResponseMessage[]
): AgentMessage[] {
  return messages
    .map((message) =>
      message.role === 'assistant' ? fromAssistant(message) : fromTool(message)
    )
    .filter(carriesTranscript);
}

function toToolResults(parts: readonly AgentMessagePart[]): ToolResultPart[] {
  return parts
    .filter((part): part is AgentToolResultPart => part.type === 'tool-result')
    .map((part) => ({
      type: 'tool-result',
      toolCallId: part.toolCallId,
      toolName: part.toolName,
      output: toToolOutput(part),
    }));
}

// A hand-edited row, or one written before outputType existed, would otherwise
// replay output: undefined and be rejected as invalid provider input.
function unsupportedOutput(
  _outputType: never,
  output: unknown
): ToolResultOutput {
  return { type: 'error-text', value: String(output) };
}

function toToolOutput(part: AgentToolResultPart): ToolResultOutput {
  switch (part.outputType) {
    case 'text':
      return { type: 'text', value: String(part.output) };
    case 'error-text':
      return { type: 'error-text', value: String(part.output) };
    case 'json':
      return { type: 'json', value: part.output as ToolResultJsonValue };
    case 'error-json':
      return { type: 'error-json', value: part.output as ToolResultJsonValue };
    case 'content':
      return { type: 'content', value: part.output as ToolResultContentValue };
    case 'execution-denied':
      return { type: 'execution-denied', reason: String(part.output) };
    default:
      return unsupportedOutput(part.outputType, part.output);
  }
}

/**
 * SDK messages for the next `streamText` call, built from the persisted domain transcript.
 * A tool message that holds no tool result is skipped: providers reject an empty content array.
 */
export function toModelMessages(
  messages: readonly AgentMessage[]
): ModelMessage[] {
  return messages.flatMap<ModelMessage>((message) => {
    if (message.role === 'tool') {
      const content = toToolResults(message.parts ?? []);
      return content.length > 0 ? [{ role: 'tool', content }] : [];
    }

    if (message.role === 'assistant' && message.parts?.length) {
      return [
        {
          role: 'assistant',
          content: message.parts.flatMap<AssistantPart>((part) => {
            if (part.type === 'text') {
              return [{ type: 'text', text: part.text }];
            }
            if (part.type === 'tool-call') {
              return [
                {
                  type: 'tool-call',
                  toolCallId: part.toolCallId,
                  toolName: part.toolName,
                  input: part.input,
                },
              ];
            }
            return [];
          }),
        },
      ];
    }

    return [{ role: message.role, content: message.content }];
  });
}
