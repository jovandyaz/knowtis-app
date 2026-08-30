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
): Pick<AgentToolResultPart, 'output' | 'isError'> {
  switch (output.type) {
    case 'text':
    case 'json':
    case 'content':
      return { output: output.value, isError: false };
    case 'error-text':
    case 'error-json':
      return { output: output.value, isError: true };
    case 'execution-denied':
      return {
        output: output.reason ?? EXECUTION_DENIED_FALLBACK,
        isError: true,
      };
    default: {
      const unsupported: never = output;
      return { output: unsupported, isError: false };
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

function toToolOutput(part: AgentToolResultPart): ToolResultOutput {
  if (part.isError) {
    return {
      type: 'error-text',
      value:
        typeof part.output === 'string'
          ? part.output
          : JSON.stringify(part.output),
    };
  }
  return typeof part.output === 'string'
    ? { type: 'text', value: part.output }
    : { type: 'json', value: part.output as ToolResultJsonValue };
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
