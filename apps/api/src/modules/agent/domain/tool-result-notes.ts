import type { AgentSource } from './agent-event';
import type { AgentMessagePart, AgentToolResultPart } from './agent-message';
import type { ConversationMessageRow } from './ports/conversation.repository';

/** What a replayed tool result becomes once it involves a note its reader can no longer open. */
export const NOTE_UNAVAILABLE_OUTPUT = { error: 'note_unavailable' } as const;

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

function partsOf(row: ConversationMessageRow): readonly AgentMessagePart[] {
  return row.parts ?? [];
}

function normalizedNoteId(noteId: string): string {
  return noteId.toLowerCase();
}

function callKey(row: ConversationMessageRow, toolCallId: string): string {
  return `${row.turnId ?? ''}/${toolCallId}`;
}

// Scoped to the turn because some providers number calls per turn (`tool_0`);
// inside one turn a shared id is checked against every call that used it, so a
// collision can only over-redact.
function noteIdArgumentsByCall(
  rows: readonly ConversationMessageRow[]
): Map<string, string[]> {
  const byCall = new Map<string, string[]>();
  for (const row of rows) {
    for (const part of partsOf(row)) {
      if (part.type !== 'tool-call') {
        continue;
      }
      const noteId = noteIdArgument(part.input);
      if (noteId !== undefined) {
        const key = callKey(row, part.toolCallId);
        byCall.set(key, [...(byCall.get(key) ?? []), normalizedNoteId(noteId)]);
      }
    }
  }
  return byCall;
}

function noteIdsOfResult(
  row: ConversationMessageRow,
  result: AgentToolResultPart,
  argumentsByCall: ReadonlyMap<string, readonly string[]>
): string[] {
  return [
    ...(argumentsByCall.get(callKey(row, result.toolCallId)) ?? []),
    ...notesInToolOutput(result.output).map((note) =>
      normalizedNoteId(note.id)
    ),
  ];
}

/** Every note a stored tool result depends on, lowercased: the `noteId` its call was given and the notes it lists. */
export function noteIdsInToolResults(
  rows: readonly ConversationMessageRow[]
): string[] {
  const argumentsByCall = noteIdArgumentsByCall(rows);
  const ids = rows.flatMap((row) =>
    partsOf(row)
      .filter(isToolResult)
      .flatMap((result) => noteIdsOfResult(row, result, argumentsByCall))
  );
  return [...new Set(ids)];
}

/** Replaces each tool result that depends on a note outside `readable` with {@link NOTE_UNAVAILABLE_OUTPUT}; the call and its result stay paired. Ids compare case-insensitively. */
export function redactUnreadableToolResults(
  rows: readonly ConversationMessageRow[],
  readable: ReadonlySet<string>
): ConversationMessageRow[] {
  const argumentsByCall = noteIdArgumentsByCall(rows);
  const readableIds = new Set([...readable].map(normalizedNoteId));
  const unavailable = (
    row: ConversationMessageRow,
    part: AgentMessagePart
  ): part is AgentToolResultPart =>
    isToolResult(part) &&
    noteIdsOfResult(row, part, argumentsByCall).some(
      (noteId) => !readableIds.has(noteId)
    );
  return rows.map((row) =>
    row.parts
      ? {
          ...row,
          parts: row.parts.map((part) =>
            unavailable(row, part)
              ? { ...part, output: NOTE_UNAVAILABLE_OUTPUT, outputType: 'json' }
              : part
          ),
        }
      : row
  );
}
