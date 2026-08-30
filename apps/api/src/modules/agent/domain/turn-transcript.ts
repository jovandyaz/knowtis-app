import type { MessageStopReason } from '@knowtis/shared-types';

import type { AgentSource } from './agent-event';
import type { AgentMessage, AgentRole } from './agent-message';
import type { PersistedTurnMessage } from './ports/conversation.repository';

const ASSISTANT_ROLE: AgentRole = 'assistant';

export interface TurnRowsInput {
  readonly userContent?: string | undefined;
  readonly turnMessages: readonly AgentMessage[];
  readonly assistantText: string;
  readonly sources: readonly AgentSource[];
  readonly stopReason: MessageStopReason;
}

/** Rows to persist for one turn: the user row, the rows of every completed step, and the terminal assistant row carrying the stop reason. */
export function buildTurnRows(input: TurnRowsInput): PersistedTurnMessage[] {
  const { userContent, turnMessages, assistantText, sources, stopReason } =
    input;
  const rows: PersistedTurnMessage[] = [];
  if (userContent !== undefined) {
    rows.push({ role: 'user', content: userContent });
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
    rows.push({
      role: ASSISTANT_ROLE,
      content: partialText,
      sources,
      stopReason,
    });
    return rows;
  }
  const last = rows.at(-1);
  if (last && last.role === ASSISTANT_ROLE) {
    rows[rows.length - 1] = { ...last, sources, stopReason };
  }
  return rows;
}
