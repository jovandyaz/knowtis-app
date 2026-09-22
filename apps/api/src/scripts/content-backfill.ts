import { and, asc, eq, gt, isNotNull, ne } from 'drizzle-orm';

import type { Database } from '../database/database.module';
import { noteEmbeddings } from '../database/schema/note-embeddings.schema';
import { notes } from '../database/schema/notes.schema';
import { yjsStateToHtml } from '../modules/notes/infrastructure/html-to-yjs';
import { isTrivialHtml } from '../modules/notes/infrastructure/trivial-html';

export const BACKFILL_BATCH_SIZE = 100;

const EMPTY_STATE = Buffer.alloc(0);

const BEFORE_ANY_NOTE_EDIT = new Date(0);

export const EMPTY_STATE_OVER_CONTENT =
  'the CRDT state renders an empty note over stored content';

export const CONTENT_DECISION = {
  UNCHANGED: 'unchanged',
  CHANGED: 'changed',
  FAILED: 'failed',
} as const;

export type ContentDecision =
  | { readonly kind: typeof CONTENT_DECISION.UNCHANGED }
  | { readonly kind: typeof CONTENT_DECISION.CHANGED; readonly html: string }
  | { readonly kind: typeof CONTENT_DECISION.FAILED; readonly reason: string };

export interface NoteState {
  readonly id: string;
  readonly content: string;
  readonly yjsState: Buffer;
  readonly hasEmbedding: boolean;
}

export interface ContentReplacement {
  readonly written: boolean;
  readonly embeddingMarkedStale: boolean;
}

export interface NoteContentStore {
  statesAfter(id: string | null, limit: number): Promise<readonly NoteState[]>;
  replaceContent(note: NoteState, html: string): Promise<ContentReplacement>;
}

export interface BackfillFailure {
  readonly id: string;
  readonly reason: string;
}

export interface BackfillReport {
  readonly scanned: number;
  readonly unchanged: number;
  readonly changed: readonly string[];
  readonly superseded: readonly string[];
  readonly failed: readonly BackfillFailure[];
  readonly embeddingsMarkedStale: number;
}

function reasonOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function decideContent(
  yjsState: Buffer,
  content: string
): ContentDecision {
  let html: string;
  try {
    html = yjsStateToHtml(yjsState);
  } catch (error) {
    return { kind: CONTENT_DECISION.FAILED, reason: reasonOf(error) };
  }
  if (html === content) {
    return { kind: CONTENT_DECISION.UNCHANGED };
  }
  // The same rule as the collaboration store guard: a stored body is never
  // replaced by an empty document, which may be the only copy left of it.
  if (isTrivialHtml(html) && !isTrivialHtml(content)) {
    return { kind: CONTENT_DECISION.FAILED, reason: EMPTY_STATE_OVER_CONTENT };
  }
  return { kind: CONTENT_DECISION.CHANGED, html };
}

export async function backfillNoteContent(
  store: NoteContentStore,
  { apply }: { readonly apply: boolean }
): Promise<BackfillReport> {
  let scanned = 0;
  let unchanged = 0;
  const changed: string[] = [];
  const superseded: string[] = [];
  const failed: BackfillFailure[] = [];
  let embeddingsMarkedStale = 0;

  let after: string | null = null;
  for (;;) {
    const batch = await store.statesAfter(after, BACKFILL_BATCH_SIZE);
    const last = batch.at(-1);
    if (!last) {
      break;
    }
    for (const note of batch) {
      scanned += 1;
      const decision = decideContent(note.yjsState, note.content);
      if (decision.kind === CONTENT_DECISION.UNCHANGED) {
        unchanged += 1;
      } else if (decision.kind === CONTENT_DECISION.FAILED) {
        failed.push({ id: note.id, reason: decision.reason });
      } else if (!apply) {
        changed.push(note.id);
        embeddingsMarkedStale += note.hasEmbedding ? 1 : 0;
      } else {
        try {
          const { written, embeddingMarkedStale } = await store.replaceContent(
            note,
            decision.html
          );
          (written ? changed : superseded).push(note.id);
          embeddingsMarkedStale += embeddingMarkedStale ? 1 : 0;
        } catch (error) {
          failed.push({ id: note.id, reason: reasonOf(error) });
        }
      }
    }
    after = last.id;
  }

  return {
    scanned,
    unchanged,
    changed,
    superseded,
    failed,
    embeddingsMarkedStale,
  };
}

export function drizzleNoteContentStore(db: Database): NoteContentStore {
  return {
    async statesAfter(id, limit) {
      const rows = await db
        .select({
          id: notes.id,
          content: notes.content,
          yjsState: notes.yjsState,
          embeddedNoteId: noteEmbeddings.noteId,
        })
        .from(notes)
        .leftJoin(noteEmbeddings, eq(noteEmbeddings.noteId, notes.id))
        .where(
          and(
            isNotNull(notes.yjsState),
            ne(notes.yjsState, EMPTY_STATE),
            id === null ? undefined : gt(notes.id, id)
          )
        )
        .orderBy(asc(notes.id))
        .limit(limit);
      return rows.flatMap(({ yjsState, embeddedNoteId, ...row }) =>
        yjsState
          ? [{ ...row, yjsState, hasEmbedding: embeddedNoteId !== null }]
          : []
      );
    },

    // Guarded by the state it was rendered from, so a save that lands during
    // the run keeps its own content instead of this older render.
    async replaceContent(note, html) {
      return db.transaction(async (tx) => {
        const written = await tx
          .update(notes)
          .set({ content: html })
          .where(and(eq(notes.id, note.id), eq(notes.yjsState, note.yjsState)))
          .returning({ id: notes.id });
        if (written.length === 0) {
          return { written: false, embeddingMarkedStale: false };
        }
        const marked = await tx
          .update(noteEmbeddings)
          .set({ updatedAt: BEFORE_ANY_NOTE_EDIT })
          .where(eq(noteEmbeddings.noteId, note.id))
          .returning({ noteId: noteEmbeddings.noteId });
        return { written: true, embeddingMarkedStale: marked.length > 0 };
      });
    },
  };
}
