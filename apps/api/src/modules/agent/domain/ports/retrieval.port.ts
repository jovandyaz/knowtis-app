import type { AgentNote, NoteHit, NotesOverview } from '../retrieval';

export interface RetrievalPort {
  search(userId: string, query: string): Promise<NoteHit[]>;
  getById(userId: string, noteId: string): Promise<AgentNote | null>;
  listRecent(userId: string, limit: number): Promise<NoteHit[]>;
  overview(userId: string): Promise<NotesOverview>;
}

export const RETRIEVAL_PORT = Symbol('RETRIEVAL_PORT');
