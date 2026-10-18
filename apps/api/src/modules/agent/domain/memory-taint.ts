import type { AgentMessagePart, AgentRole } from './agent-message';
import { isContinueMarker } from './continue-marker';
import type { ConversationMessageRow } from './ports/conversation.repository';
import {
  NOTE_EXPOSURE,
  type NoteExposure,
} from './ports/note-exposure.repository';
import type { NoteContentStatus } from './retrieval';
import {
  NOTE_UNAVAILABLE_INPUT,
  NOTE_UNAVAILABLE_OUTPUT,
  noteCandidates,
  noteIdsInToolParts,
} from './tool-result-notes';

export const MEMORY_TAINT_REASONS = [
  'web',
  'foreign_note',
  'shared_editable_note',
  'withheld_content',
  'unavailable_note',
  'unknown_tool',
  'legacy_row',
  'history_truncated',
] as const;

/** Why a conversation's assistant text may carry words that someone other than the user wrote. */
export type MemoryTaintReason = (typeof MEMORY_TAINT_REASONS)[number];

const WEB = 'web' satisfies MemoryTaintReason;
const FOREIGN_NOTE = 'foreign_note' satisfies MemoryTaintReason;
const SHARED_EDITABLE_NOTE = 'shared_editable_note' satisfies MemoryTaintReason;
const WITHHELD_CONTENT = 'withheld_content' satisfies MemoryTaintReason;
const UNAVAILABLE_NOTE = 'unavailable_note' satisfies MemoryTaintReason;
const UNKNOWN_TOOL = 'unknown_tool' satisfies MemoryTaintReason;
const LEGACY_ROW = 'legacy_row' satisfies MemoryTaintReason;
const HISTORY_TRUNCATED = 'history_truncated' satisfies MemoryTaintReason;

/** Tools whose results hold nothing but notes and proposals, so a note they name taints only through its exposure or the ownership a result reports. */
export const MEMORY_SAFE_TOOLS = [
  'searchNotes',
  'getNote',
  'listRecentNotes',
  'getNotesOverview',
  'proposeCreateNote',
  'proposeEditNote',
  'proposeUpdateNote',
  'proposeShareNote',
] as const;

/** Tools whose results hold web content. */
export const MEMORY_WEB_TOOLS = ['webSearch', 'webFetch'] as const;

const SAFE_TOOLS: ReadonlySet<string> = new Set(MEMORY_SAFE_TOOLS);
const WEB_TOOLS: ReadonlySet<string> = new Set(MEMORY_WEB_TOOLS);
const WITHHELD_STATUS = 'withheld' satisfies NoteContentStatus;
const USER_ROLE = 'user' satisfies AgentRole;
const ASSISTANT_ROLE = 'assistant' satisfies AgentRole;
const TOOL_ROLE = 'tool' satisfies AgentRole;
const TOOL_RESULT_PART = 'tool-result' satisfies AgentMessagePart['type'];
const REASON_BY_EXPOSURE = {
  [NOTE_EXPOSURE.foreign]: FOREIGN_NOTE,
  [NOTE_EXPOSURE.editableByOthers]: SHARED_EDITABLE_NOTE,
  [NOTE_EXPOSURE.missing]: UNAVAILABLE_NOTE,
} as const satisfies Record<NoteExposure, MemoryTaintReason>;

export interface MemoryTranscriptRow {
  readonly role: Exclude<AgentRole, typeof TOOL_ROLE>;
  readonly content: string;
}

export interface MemoryTranscript {
  /** The newest text rows, oldest first. */
  readonly rows: readonly MemoryTranscriptRow[];
  readonly tainted: boolean;
  /** Each reason once, in the order it was found. */
  readonly reasons: readonly MemoryTaintReason[];
}

export interface MemoryTranscriptOptions {
  readonly textLimit: number;
  /** The loaded rows are not the whole conversation, so what came before them was never checked. */
  readonly historyTruncated: boolean;
  /** How each note the rows name may carry someone else's words, keyed by lowercased id; a note left out is the user's alone. */
  readonly noteExposures: ReadonlyMap<string, NoteExposure>;
}

function hasProperty<K extends string>(
  value: unknown,
  key: K
): value is Record<K, unknown> {
  return typeof value === 'object' && value !== null && key in value;
}

function isForeignNote(entry: unknown): boolean {
  return (
    (hasProperty(entry, 'isOwner') && entry.isOwner === false) ||
    (hasProperty(entry, 'isSharedWithMe') && entry.isSharedWithMe === true)
  );
}

function isWithheldRead(entry: unknown): boolean {
  return (
    hasProperty(entry, 'contentStatus') &&
    entry.contentStatus === WITHHELD_STATUS
  );
}

function isUnavailableOutput(output: unknown): boolean {
  return (
    hasProperty(output, 'error') &&
    output.error === NOTE_UNAVAILABLE_OUTPUT.error
  );
}

function isUnavailableInput(input: unknown): boolean {
  return (
    hasProperty(input, 'note') && input.note === NOTE_UNAVAILABLE_INPUT.note
  );
}

function resultTaints(output: unknown): MemoryTaintReason[] {
  if (isUnavailableOutput(output)) {
    return [UNAVAILABLE_NOTE];
  }
  const notes = noteCandidates(output);
  const found: MemoryTaintReason[] = [];
  if (notes.some(isForeignNote)) {
    found.push(FOREIGN_NOTE);
  }
  if (notes.some(isWithheldRead)) {
    found.push(WITHHELD_CONTENT);
  }
  return found;
}

function partTaints(part: AgentMessagePart): MemoryTaintReason[] {
  if (part.type === 'text') {
    return [];
  }
  if (WEB_TOOLS.has(part.toolName)) {
    return [WEB];
  }
  if (!SAFE_TOOLS.has(part.toolName)) {
    return [UNKNOWN_TOOL];
  }
  if (part.type === 'tool-call') {
    return isUnavailableInput(part.input) ? [UNAVAILABLE_NOTE] : [];
  }
  return resultTaints(part.output);
}

function carriesToolResult(row: ConversationMessageRow): boolean {
  return (row.parts ?? []).some((part) => part.type === TOOL_RESULT_PART);
}

function rowTaints(
  row: ConversationMessageRow,
  noteExposures: ReadonlyMap<string, NoteExposure>
): MemoryTaintReason[] {
  if (row.role === USER_ROLE) {
    return [];
  }
  if (row.role === TOOL_ROLE && !carriesToolResult(row)) {
    return [UNKNOWN_TOOL];
  }
  const found = (row.parts ?? []).flatMap(partTaints);
  if (row.role === ASSISTANT_ROLE && row.turnId === null) {
    found.unshift(LEGACY_ROW);
  }
  for (const id of noteIdsInToolParts([row])) {
    const exposure = noteExposures.get(id);
    if (exposure) {
      found.push(REASON_BY_EXPOSURE[exposure]);
    }
  }
  return found;
}

function turnStarts(rows: readonly ConversationMessageRow[]): number[] {
  const firstIndexOfTurn = new Map<string, number>();
  return rows.map((row, index) => {
    if (row.turnId === null) {
      return index;
    }
    const first = firstIndexOfTurn.get(row.turnId) ?? index;
    firstIndexOfTurn.set(row.turnId, first);
    return first;
  });
}

function textRowOf(
  row: ConversationMessageRow,
  afterTaint: boolean
): MemoryTranscriptRow | null {
  if (row.content.trim() === '' || isContinueMarker(row)) {
    return null;
  }
  if (row.role === USER_ROLE || (row.role === ASSISTANT_ROLE && !afterTaint)) {
    return { role: row.role, content: row.content };
  }
  return null;
}

/**
 * The text a memory extractor may read from `rows` (oldest first). A turn that used a tool outside
 * {@link MEMORY_SAFE_TOOLS}, named a note listed in `noteExposures` or that a result reports as someone
 * else's, read one it could not have read whole, or that predates per-turn tool records taints the
 * conversation:
 * from that turn on only user rows are kept, since any later assistant reply may repeat what the
 * tainted turn read.
 */
export function memoryTranscript(
  rows: readonly ConversationMessageRow[],
  options: MemoryTranscriptOptions
): MemoryTranscript {
  const reasons = new Set<MemoryTaintReason>(
    options.historyTruncated ? [HISTORY_TRUNCATED] : []
  );
  const starts = turnStarts(rows);
  let taintStart = options.historyTruncated ? 0 : rows.length;
  rows.forEach((row, index) => {
    const found = rowTaints(row, options.noteExposures);
    if (found.length === 0) {
      return;
    }
    found.forEach((reason) => reasons.add(reason));
    taintStart = Math.min(taintStart, starts[index] ?? index);
  });
  const kept = rows.flatMap((row, index) => {
    const text = textRowOf(row, index >= taintStart);
    return text ? [text] : [];
  });
  return {
    rows: kept.slice(-options.textLimit),
    tainted: reasons.size > 0,
    reasons: [...reasons],
  };
}
