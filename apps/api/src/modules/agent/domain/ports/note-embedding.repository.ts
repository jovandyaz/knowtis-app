export interface StaleNote {
  readonly noteId: string;
  readonly title: string;
  readonly content: string;
  readonly inputHash: string | null;
}

export interface UpsertEmbeddingInput {
  readonly noteId: string;
  readonly embedding: number[];
  readonly model: string;
  readonly inputHash: string;
}

export interface NoteEmbeddingRepository {
  /** Notes missing an embedding or whose note.updated_at is newer than the
   * embedding row, settled past the quiet-period, capped at `limit`. */
  findStaleNotes(quietSeconds: number, limit: number): Promise<StaleNote[]>;
  upsert(input: UpsertEmbeddingInput): Promise<void>;
  touch(noteId: string): Promise<void>;
}

export const NOTE_EMBEDDING_REPOSITORY = Symbol('NOTE_EMBEDDING_REPOSITORY');
