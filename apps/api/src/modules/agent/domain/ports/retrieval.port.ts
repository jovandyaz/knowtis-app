import type { AgentNote, NoteHit, NotesOverview } from '../retrieval';

export interface RetrievalPort {
  search(userId: string, query: string): Promise<NoteHit[]>;
  /** Accessible notes semantic search cannot reach yet. Empty whenever the
   * vector leg is not running, so callers never promise indexing that is off. */
  listUnindexed(userId: string, limit: number): Promise<NoteHit[]>;
  getById(userId: string, noteId: string): Promise<AgentNote | null>;
  listRecent(userId: string, limit: number): Promise<NoteHit[]>;
  overview(userId: string): Promise<NotesOverview>;
}

export const RETRIEVAL_PORT = Symbol('RETRIEVAL_PORT');
