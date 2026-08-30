import type { MessageStopReason } from '@knowtis/shared-types';

import {
  textOfParts,
  type AgentMessage,
  type AgentMessagePart,
  type AgentRole,
} from './agent-message';
import type { ConversationMessageRow } from './ports/conversation.repository';

export const PARTIAL_STOP_REASONS = ['aborted', 'error', 'length'] as const;
type PartialStopReason = (typeof PARTIAL_STOP_REASONS)[number];

const TOOL_ROLE: AgentRole = 'tool';

export interface PruneOptions {
  /** How many of the most recent tool-using turns keep their tool parts; 0 replays text only. */
  readonly keepToolTurns: number;
}

function isPartial(
  reason: MessageStopReason | null
): reason is PartialStopReason {
  return (
    reason !== null &&
    (PARTIAL_STOP_REASONS as readonly string[]).includes(reason)
  );
}

/** Marker appended to an assistant reply the model never finished, so the next turn reads the truncation as data. */
export function partialReplySuffix(reason: MessageStopReason): string {
  return `\n\n[reply cut off: ${reason}]`;
}

// toModelMessages renders a parts-bearing row from its parts and ignores
// content, so the marker has to reach both rendering paths.
function markPartial(
  message: AgentMessage,
  reason: PartialStopReason
): AgentMessage {
  const suffix = partialReplySuffix(reason);
  const content = `${message.content}${suffix}`;
  return message.parts && message.parts.length > 0
    ? {
        ...message,
        content,
        parts: [...message.parts, { type: 'text', text: suffix }],
      }
    : { ...message, content };
}

// Nothing serializes turns per conversation, so a concurrent turn's row can
// land between an assistant tool-call and its result; a provider rejects that
// ordering, and the rows replay on every load until the window slides past.
function groupTurns(
  rows: readonly ConversationMessageRow[]
): readonly ConversationMessageRow[] {
  const groups: ConversationMessageRow[][] = [];
  const byTurn = new Map<string, ConversationMessageRow[]>();
  for (const row of rows) {
    const group = row.turnId ? byTurn.get(row.turnId) : undefined;
    if (group) {
      group.push(row);
      continue;
    }
    const created = [row];
    groups.push(created);
    if (row.turnId) {
      byTurn.set(row.turnId, created);
    }
  }
  return groups.flat();
}

function recentToolTurns(
  rows: readonly ConversationMessageRow[],
  keep: number
): Set<string> {
  const turns = new Set<string>();
  for (let i = rows.length - 1; i >= 0 && turns.size < keep; i -= 1) {
    const r = rows[i];
    if (r.turnId && r.parts && r.parts.length > 0) {
      turns.add(r.turnId);
    }
  }
  return turns;
}

function textOnly(row: ConversationMessageRow): AgentMessage | null {
  if (row.role === TOOL_ROLE) {
    return null;
  }
  const content = row.parts
    ? textOfParts(row.parts) || row.content
    : row.content;
  return content.length > 0 || row.role === 'user'
    ? { role: row.role, content }
    : null;
}

function withParts(row: ConversationMessageRow): AgentMessage {
  return row.parts && row.parts.length > 0
    ? { role: row.role, content: row.content, parts: row.parts }
    : { role: row.role, content: row.content };
}

function stripOrphans(messages: AgentMessage[]): AgentMessage[] {
  const calls = new Set<string>();
  const results = new Set<string>();
  for (const m of messages) {
    for (const p of m.parts ?? []) {
      if (p.type === 'tool-call') {
        calls.add(p.toolCallId);
      }
      if (p.type === 'tool-result') {
        results.add(p.toolCallId);
      }
    }
  }
  const out: AgentMessage[] = [];
  for (const m of messages) {
    if (!m.parts) {
      out.push(m);
      continue;
    }
    const parts: AgentMessagePart[] = m.parts.filter((p) =>
      p.type === 'text'
        ? true
        : p.type === 'tool-call'
          ? results.has(p.toolCallId)
          : calls.has(p.toolCallId)
    );
    const hasToolActivity = parts.some((p) => p.type !== 'text');
    if (m.role === TOOL_ROLE) {
      if (hasToolActivity) {
        out.push({ role: TOOL_ROLE, content: '', parts });
      }
      continue;
    }
    if (hasToolActivity) {
      out.push({ role: m.role, content: m.content, parts });
    } else if (m.content.length > 0) {
      out.push({ role: m.role, content: m.content });
    }
  }
  return out;
}

/** Turns stored rows into the history the model should see: recent tool turns verbatim, older turns as text, orphans stripped, partial replies marked as data. */
export function pruneTranscript(
  rows: readonly ConversationMessageRow[],
  options: PruneOptions
): AgentMessage[] {
  const ordered = groupTurns(rows);
  const keep = recentToolTurns(ordered, options.keepToolTurns);
  const messages: AgentMessage[] = [];
  for (const row of ordered) {
    const kept =
      row.turnId && keep.has(row.turnId) ? withParts(row) : textOnly(row);
    if (!kept) {
      continue;
    }
    messages.push(
      kept.role === 'assistant' && isPartial(row.stopReason)
        ? markPartial(kept, row.stopReason)
        : kept
    );
  }
  return stripOrphans(messages);
}
