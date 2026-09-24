import type { AgentSource } from './agent-event';
import type {
  AgentMessagePart,
  AgentRole,
  AgentToolCallPart,
  AgentToolResultPart,
} from './agent-message';
import type { ConversationMessageRow } from './ports/conversation.repository';

/** What a replayed tool result becomes once it involves a note its reader can no longer open. */
export const NOTE_UNAVAILABLE_OUTPUT = { error: 'note_unavailable' } as const;

/** What a replayed tool call's input becomes once it names a note its reader can no longer open. */
export const NOTE_UNAVAILABLE_INPUT = { note: 'unavailable' } as const;

const ASSISTANT_ROLE: AgentRole = 'assistant';

export function isSourceNote(value: unknown): value is AgentSource {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'title' in value &&
    typeof value.id === 'string' &&
    typeof value.title === 'string'
  );
}

/** `searchNotes` reports `{hits, unindexed}`; `listRecentNotes` a bare array. */
function noteCandidates(output: unknown): unknown[] {
  if (Array.isArray(output)) {
    return output;
  }
  if (typeof output === 'object' && output !== null && 'hits' in output) {
    const { hits, unindexed } = output as {
      hits?: unknown;
      unindexed?: unknown;
    };
    return [
      ...(Array.isArray(hits) ? hits : []),
      ...(Array.isArray(unindexed) ? unindexed : []),
    ];
  }
  return [output];
}

export function notesInToolOutput(output: unknown): AgentSource[] {
  return noteCandidates(output)
    .filter(isSourceNote)
    .map(({ id, title }) => ({ id, title }));
}

function noteIdArgument(input: unknown): string | undefined {
  return typeof input === 'object' &&
    input !== null &&
    'noteId' in input &&
    typeof input.noteId === 'string'
    ? input.noteId
    : undefined;
}

function isToolResult(part: AgentMessagePart): part is AgentToolResultPart {
  return part.type === 'tool-result';
}

function isToolCall(part: AgentMessagePart): part is AgentToolCallPart {
  return part.type === 'tool-call';
}

function partsOf(row: ConversationMessageRow): readonly AgentMessagePart[] {
  return row.parts ?? [];
}

function normalizedNoteId(noteId: string): string {
  return noteId.toLowerCase();
}

// Keyed by leg because some providers number calls per request (`tool_0`) and a
// turn resumed after a proposal makes one request per leg; a leg ends at the
// only row that carries a stop reason.
function legKeysOf(rows: readonly ConversationMessageRow[]): string[] {
  const legsByTurn = new Map<string, number>();
  return rows.map((row) => {
    const turn = row.turnId ?? '';
    const leg = legsByTurn.get(turn) ?? 0;
    if (row.role === ASSISTANT_ROLE && row.stopReason !== null) {
      legsByTurn.set(turn, leg + 1);
    }
    return `${turn}/${leg}`;
  });
}

function callKey(legKey: string, toolCallId: string): string {
  return `${legKey}/${toolCallId}`;
}

// Inside one leg a shared call id is checked against every call that used it,
// so a collision can only over-redact.
function noteIdArgumentsByCall(
  rows: readonly ConversationMessageRow[],
  legKeys: readonly string[]
): Map<string, string[]> {
  const byCall = new Map<string, string[]>();
  rows.forEach((row, index) => {
    for (const part of partsOf(row).filter(isToolCall)) {
      const noteId = noteIdArgument(part.input);
      if (noteId !== undefined) {
        const key = callKey(legKeys[index], part.toolCallId);
        byCall.set(key, [...(byCall.get(key) ?? []), normalizedNoteId(noteId)]);
      }
    }
  });
  return byCall;
}

function noteIdsOfResult(
  legKey: string,
  result: AgentToolResultPart,
  argumentsByCall: ReadonlyMap<string, readonly string[]>
): string[] {
  return [
    ...(argumentsByCall.get(callKey(legKey, result.toolCallId)) ?? []),
    ...notesInToolOutput(result.output).map((note) =>
      normalizedNoteId(note.id)
    ),
  ];
}

/** Every note a stored tool call or result depends on, lowercased: the `noteId` a call was given and the notes a result lists. */
export function noteIdsInToolParts(
  rows: readonly ConversationMessageRow[]
): string[] {
  const ids = rows.flatMap((row) =>
    partsOf(row).flatMap((part) => {
      if (isToolCall(part)) {
        const noteId = noteIdArgument(part.input);
        return noteId === undefined ? [] : [normalizedNoteId(noteId)];
      }
      return isToolResult(part)
        ? notesInToolOutput(part.output).map((note) =>
            normalizedNoteId(note.id)
          )
        : [];
    })
  );
  return [...new Set(ids)];
}

/**
 * Replaces the input of each tool call on a note outside `readable` with {@link NOTE_UNAVAILABLE_INPUT},
 * since it may quote the note, and each tool result that depends on such a note with
 * {@link NOTE_UNAVAILABLE_OUTPUT}; every call stays paired with its result. Ids compare case-insensitively.
 */
export function redactUnreadableToolParts(
  rows: readonly ConversationMessageRow[],
  readable: ReadonlySet<string>
): ConversationMessageRow[] {
  const legKeys = legKeysOf(rows);
  const argumentsByCall = noteIdArgumentsByCall(rows, legKeys);
  const readableIds = new Set([...readable].map(normalizedNoteId));
  const isUnreadable = (noteId: string) => !readableIds.has(noteId);
  const redactPart = (
    legKey: string,
    part: AgentMessagePart
  ): AgentMessagePart => {
    if (isToolCall(part)) {
      const noteId = noteIdArgument(part.input);
      return noteId !== undefined && isUnreadable(normalizedNoteId(noteId))
        ? { ...part, input: NOTE_UNAVAILABLE_INPUT }
        : part;
    }
    return isToolResult(part) &&
      noteIdsOfResult(legKey, part, argumentsByCall).some(isUnreadable)
      ? { ...part, output: NOTE_UNAVAILABLE_OUTPUT, outputType: 'json' }
      : part;
  };
  return rows.map((row, index) =>
    row.parts
      ? {
          ...row,
          parts: row.parts.map((part) => redactPart(legKeys[index], part)),
        }
      : row
  );
}
