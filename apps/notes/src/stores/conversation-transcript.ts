import {
  AGENT_STOP_REASON,
  MESSAGE_STOP_REASON,
  type AgentStopReason,
  type ConversationTranscriptMessage,
} from '@knowtis/shared-types';

import type { AgentChatMessage } from './agent.store';

const ASSISTANT_ROLE = 'assistant' satisfies AgentChatMessage['role'];

const DISPLAYED_STOP_REASONS: readonly string[] =
  Object.values(AGENT_STOP_REASON);

const INTERRUPTED_STOP_REASONS: readonly string[] = MESSAGE_STOP_REASON.filter(
  (reason) => !DISPLAYED_STOP_REASONS.includes(reason)
);

function isDisplayedStopReason(
  reason: string | null
): reason is AgentStopReason {
  return reason !== null && DISPLAYED_STOP_REASONS.includes(reason);
}

// Each stored leg of a turn ends with the only row that carries a stop reason:
// the reply before a proposal and the reply after the decision share the turn
// id but streamed as separate bubbles.
function continuesTurn(
  previous: ConversationTranscriptMessage | undefined,
  row: ConversationTranscriptMessage
): boolean {
  return (
    previous?.role === ASSISTANT_ROLE &&
    previous.stopReason === null &&
    row.role === ASSISTANT_ROLE &&
    row.turnId !== null &&
    row.turnId === previous.turnId
  );
}

function turnOf(row: ConversationTranscriptMessage) {
  return row.turnId !== null ? { turnId: row.turnId } : {};
}

function assistantDetails(row: ConversationTranscriptMessage) {
  return {
    sources: row.sources,
    ...(isDisplayedStopReason(row.stopReason)
      ? { stopReason: row.stopReason }
      : {}),
    ...(row.stopReason !== null &&
    INTERRUPTED_STOP_REASONS.includes(row.stopReason)
      ? { interrupted: true }
      : {}),
  };
}

function hasSomethingToShow(message: AgentChatMessage): boolean {
  return (
    message.role !== ASSISTANT_ROLE ||
    message.content.length > 0 ||
    (message.stopReason !== undefined &&
      message.stopReason !== AGENT_STOP_REASON.COMPLETED)
  );
}

export function toChatMessages(
  rows: readonly ConversationTranscriptMessage[],
  nextId: () => string
): AgentChatMessage[] {
  const messages: AgentChatMessage[] = [];
  let previous: ConversationTranscriptMessage | undefined;
  for (const row of rows) {
    const last = messages.at(-1);
    if (last && continuesTurn(previous, row)) {
      messages[messages.length - 1] = {
        id: last.id,
        ...turnOf(row),
        role: last.role,
        content: last.content + row.content,
        ...assistantDetails(row),
      };
    } else if (row.role === ASSISTANT_ROLE) {
      messages.push({
        id: nextId(),
        ...turnOf(row),
        role: row.role,
        content: row.content,
        ...assistantDetails(row),
      });
    } else {
      messages.push({
        id: nextId(),
        ...turnOf(row),
        role: row.role,
        content: row.content,
      });
    }
    previous = row;
  }
  return messages.filter(hasSomethingToShow);
}
