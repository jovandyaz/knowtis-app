import type { AiExecutionContext } from '../../../ai/domain/execution-context/ai-execution-context';
import type { AgentNote, NoteBody, NoteHit, NotesOverview } from '../retrieval';

export interface RetrievalPort {
  /** Bills the query embedding to `execution` unless `semantic` is `false`. */
  search(
    execution: AiExecutionContext,
    query: string,
    options?: { readonly semantic?: boolean }
  ): Promise<NoteHit[]>;
  /** Accessible notes semantic search cannot reach yet. Empty whenever the
   * vector leg is not running, so callers never promise indexing that is off. */
  listUnindexed(userId: string, limit: number): Promise<NoteHit[]>;
  /** Screens the body for injection, billing any classifier call to `execution`. */
  getById(
    execution: AiExecutionContext,
    noteId: string
  ): Promise<AgentNote | null>;
  getBody(userId: string, noteId: string): Promise<NoteBody | null>;
  listRecent(userId: string, limit: number): Promise<NoteHit[]>;
  overview(userId: string): Promise<NotesOverview>;
}

export const RETRIEVAL_PORT = Symbol('RETRIEVAL_PORT');
