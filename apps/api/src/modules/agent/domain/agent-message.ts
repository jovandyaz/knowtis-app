export type AgentRole = 'user' | 'assistant' | 'tool';

export interface AgentTextPart {
  readonly type: 'text';
  readonly text: string;
}

export interface AgentToolCallPart {
  readonly type: 'tool-call';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly input: unknown;
}

export interface AgentToolResultPart {
  readonly type: 'tool-result';
  readonly toolCallId: string;
  readonly toolName: string;
  readonly output: unknown;
  readonly isError: boolean;
}

export type AgentMessagePart =
  | AgentTextPart
  | AgentToolCallPart
  | AgentToolResultPart;

/** One message of a conversation as the model sees it; `parts` is present only when the message carries tool activity. */
export interface AgentMessage {
  readonly role: AgentRole;
  readonly content: string;
  readonly parts?: readonly AgentMessagePart[];
}

export const AGENT_MESSAGE_PARTS_VERSION = 1;

/** Shape stored in `conversation_messages.parts`; versioned so an SDK upgrade never invalidates rows. */
export interface PersistedParts {
  readonly v: typeof AGENT_MESSAGE_PARTS_VERSION;
  readonly parts: readonly AgentMessagePart[];
}

export function textOfParts(parts: readonly AgentMessagePart[]): string {
  return parts
    .filter((p): p is AgentTextPart => p.type === 'text')
    .map((p) => p.text)
    .join('');
}
