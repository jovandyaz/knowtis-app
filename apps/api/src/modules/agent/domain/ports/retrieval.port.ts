import type { AgentNote, NoteHit } from '../retrieval';

export interface RetrievalPort {
  search(userId: string, query: string): Promise<NoteHit[]>;
  getById(userId: string, noteId: string): Promise<AgentNote | null>;
}

export const RETRIEVAL_PORT = Symbol('RETRIEVAL_PORT');
