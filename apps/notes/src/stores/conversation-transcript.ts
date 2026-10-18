import {
  AGENT_STOP_REASON,
  isAgentStopReason,
  isMessageKind,
  MESSAGE_STOP_REASON,
  type ConversationTranscriptMessage,
} from '@knowtis/shared-types';

import type { AgentChatMessage, UsedMemory } from './agent.store';

const ASSISTANT_ROLE = 'assistant' satisfies AgentChatMessage['role'];

const INTERRUPTED_STOP_REASONS: readonly string[] = MESSAGE_STOP_REASON.filter(
  (reason) => !isAgentStopReason(reason)
);

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
    ...(row.usedMemoryIds?.length
      ? { usedMemories: row.usedMemoryIds.map((id) => ({ id })) }
      : {}),
    ...(isAgentStopReason(row.stopReason)
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

interface CarriedMemories {
  turnId: string;
  memories: readonly UsedMemory[];
}

function unionOf(
  first: readonly UsedMemory[],
  second: readonly UsedMemory[]
): UsedMemory[] {
  const byId = new Map<string, UsedMemory>();
  for (const memory of [...first, ...second]) {
    if (!byId.has(memory.id)) {
      byId.set(memory.id, memory);
    }
  }
  return [...byId.values()];
}

function shownWithCarriedMemories(
  messages: readonly AgentChatMessage[]
): AgentChatMessage[] {
  const shown: AgentChatMessage[] = [];
  let carried: CarriedMemories | undefined;
  for (const message of messages) {
    if (!hasSomethingToShow(message)) {
      if (message.turnId !== undefined && message.usedMemories) {
        carried = {
          turnId: message.turnId,
          memories:
            carried?.turnId === message.turnId
              ? unionOf(carried.memories, message.usedMemories)
              : message.usedMemories,
        };
      }
      continue;
    }
    if (
      carried &&
      message.role === ASSISTANT_ROLE &&
      message.turnId === carried.turnId
    ) {
      shown.push({
        ...message,
        usedMemories: unionOf(carried.memories, message.usedMemories ?? []),
      });
    } else {
      shown.push(message);
    }
    carried = undefined;
  }
  return shown;
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
        ...(isMessageKind(row.kind) ? { kind: row.kind } : {}),
      });
    }
    previous = row;
  }
  return shownWithCarriedMemories(messages);
}
