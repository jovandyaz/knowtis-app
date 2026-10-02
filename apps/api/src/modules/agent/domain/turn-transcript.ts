import type { MessageKind, MessageStopReason } from '@knowtis/shared-types';

import type { AgentSource } from './agent-event';
import type { AgentMessage, AgentRole } from './agent-message';
import type { PersistedTurnMessage } from './ports/conversation.repository';

const ASSISTANT_ROLE: AgentRole = 'assistant';

export interface TurnRowsInput {
  readonly userContent?: string | undefined;
  readonly userKind?: MessageKind;
  readonly turnMessages: readonly AgentMessage[];
  readonly assistantText: string;
  readonly sources: readonly AgentSource[];
  readonly stopReason: MessageStopReason;
  readonly model?: string;
}

/** Rows to persist for one turn: the user row, the rows of every completed step, and a terminal assistant row carrying the stop reason and the model that served the turn, added empty when the turn produced none. */
export function buildTurnRows(input: TurnRowsInput): PersistedTurnMessage[] {
  const {
    userContent,
    userKind,
    turnMessages,
    assistantText,
    sources,
    stopReason,
    model,
  } = input;
  const terminal = { sources, stopReason, ...(model ? { model } : {}) };
  const rows: PersistedTurnMessage[] = [];
  if (userContent !== undefined) {
    rows.push({
      role: 'user',
      content: userContent,
      ...(userKind ? { kind: userKind } : {}),
    });
  }
  // Step rows already carry the text of every completed call, so only the text
  // streamed after the last one is still missing. Step-level failover re-streams
  // an answer the step rows already hold, so a diverging stream adds nothing.
  const persistedText = turnMessages
    .filter((m) => m.role === ASSISTANT_ROLE)
    .map((m) => m.content)
    .join('');
  const partialText = assistantText.startsWith(persistedText)
    ? assistantText.slice(persistedText.length)
    : '';
  rows.push(...turnMessages);
  if (partialText.length > 0) {
    rows.push({ role: ASSISTANT_ROLE, content: partialText, ...terminal });
    return rows;
  }
  const last = rows.at(-1);
  if (last && last.role === ASSISTANT_ROLE) {
    rows[rows.length - 1] = { ...last, ...terminal };
  } else if (last) {
    rows.push({ role: ASSISTANT_ROLE, content: '', ...terminal });
  }
  return rows;
}
