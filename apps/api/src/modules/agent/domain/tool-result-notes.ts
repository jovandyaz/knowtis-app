import type { AgentSource } from './agent-event';
import type {
  AgentMessagePart,
  AgentRole,
  AgentToolResultPart,
} from './agent-message';
import type { ConversationMessageRow } from './ports/conversation.repository';

/** What a replayed tool result becomes once it involves a note its reader can no longer open. */
export const NOTE_UNAVAILABLE_OUTPUT = { error: 'note_unavailable' } as const;

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
    for (const part of partsOf(row)) {
      if (part.type !== 'tool-call') {
        continue;
      }
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

/** Every note a stored tool result depends on, lowercased: the `noteId` its call was given and the notes it lists. */
export function noteIdsInToolResults(
  rows: readonly ConversationMessageRow[]
): string[] {
  const legKeys = legKeysOf(rows);
  const argumentsByCall = noteIdArgumentsByCall(rows, legKeys);
  const ids = rows.flatMap((row, index) =>
    partsOf(row)
      .filter(isToolResult)
      .flatMap((result) =>
        noteIdsOfResult(legKeys[index], result, argumentsByCall)
      )
  );
  return [...new Set(ids)];
}

/** Replaces each tool result that depends on a note outside `readable` with {@link NOTE_UNAVAILABLE_OUTPUT}; the call and its result stay paired. Ids compare case-insensitively. */
export function redactUnreadableToolResults(
  rows: readonly ConversationMessageRow[],
  readable: ReadonlySet<string>
): ConversationMessageRow[] {
  const legKeys = legKeysOf(rows);
  const argumentsByCall = noteIdArgumentsByCall(rows, legKeys);
  const readableIds = new Set([...readable].map(normalizedNoteId));
  const unavailable = (
    legKey: string,
    part: AgentMessagePart
  ): part is AgentToolResultPart =>
    isToolResult(part) &&
    noteIdsOfResult(legKey, part, argumentsByCall).some(
      (noteId) => !readableIds.has(noteId)
    );
  return rows.map((row, index) =>
    row.parts
      ? {
          ...row,
          parts: row.parts.map((part) =>
            unavailable(legKeys[index], part)
              ? { ...part, output: NOTE_UNAVAILABLE_OUTPUT, outputType: 'json' }
              : part
          ),
        }
      : row
  );
}
