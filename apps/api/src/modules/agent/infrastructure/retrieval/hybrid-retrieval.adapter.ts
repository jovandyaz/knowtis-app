import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../../config/env.config';
import { AIRateLimitService } from '../../../ai/application/services/ai-rate-limit.service';
import {
  EMBEDDING_PORT,
  type EmbeddingPort,
} from '../../../ai/domain/ports/embedding.port';
import {
  NOTE_READ_REPOSITORY,
  type NoteReadRepository,
} from '../../../notes/domain/ports/note-read.repository';
import type { RetrievalPort } from '../../domain/ports/retrieval.port';
import type { AgentNote, NoteHit, NotesOverview } from '../../domain/retrieval';
import { KeywordRetrievalAdapter } from './keyword-retrieval.adapter';
import { toNoteHit } from './note-hit.mapper';
import { reciprocalRankFusion } from './rrf';

const CANDIDATES_PER_LEG = 50;
/** Past this, a note is not waiting its turn — the reconciler is failing on it,
 * and reporting it as pending would promise indexing that will never arrive. */
const PENDING_INDEX_WINDOW_SECONDS = 900;
const MAX_HITS = 20;

@Injectable()
export class HybridRetrievalAdapter implements RetrievalPort {
  private readonly logger = new Logger(HybridRetrievalAdapter.name);

  constructor(
    @Inject(NOTE_READ_REPOSITORY)
    private readonly notes: NoteReadRepository,
    @Inject(EMBEDDING_PORT)
    private readonly embed: EmbeddingPort,
    private readonly keyword: KeywordRetrievalAdapter,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly rateLimit: AIRateLimitService
  ) {}

  async search(userId: string, query: string): Promise<NoteHit[]> {
    const branded = UserId.create(userId);
    if (branded.isErr()) {
      return [];
    }
    const user = branded.value;

    const lexicalRows = await this.notes.findAccessibleNotesByLexicalRank(
      user,
      query,
      CANDIDATES_PER_LEG
    );
    const lexical = lexicalRows.map((r) => toNoteHit(r, userId));

    let vector: NoteHit[] = [];
    try {
      const { vector: queryVector, costUsd } =
        await this.embed.embedQuery(query);
      const model = this.config.get('AI_EMBEDDING_MODEL');
      void this.rateLimit.recordSideCost({
        userId,
        action: 'embedding',
        model,
        costUsd,
        byokTurn: false,
      });
      const vectorRows = await this.notes.findAccessibleNotesByEmbedding(
        user,
        queryVector,
        model,
        CANDIDATES_PER_LEG
      );
      vector = vectorRows.map((r) => toNoteHit(r, userId));
    } catch (error) {
      this.logger.warn(
        'Vector leg failed; returning lexical-only results',
        error instanceof Error ? error.stack : String(error)
      );
      return lexical.slice(0, MAX_HITS);
    }

    return reciprocalRankFusion([lexical, vector], undefined, MAX_HITS);
  }

  async listUnindexed(userId: string, limit: number): Promise<NoteHit[]> {
    if (!this.config.get('VOYAGE_API_KEY')) {
      return [];
    }
    const branded = UserId.create(userId);
    if (branded.isErr()) {
      return [];
    }
    const rows = await this.notes.findAccessibleNotesUnindexed(
      branded.value,
      this.config.get('AI_EMBEDDING_MODEL'),
      PENDING_INDEX_WINDOW_SECONDS,
      limit
    );
    return rows.map((r) => toNoteHit(r, userId));
  }

  getById(userId: string, noteId: string): Promise<AgentNote | null> {
    return this.keyword.getById(userId, noteId);
  }

  listRecent(userId: string, limit: number): Promise<NoteHit[]> {
    return this.keyword.listRecent(userId, limit);
  }

  overview(userId: string): Promise<NotesOverview> {
    return this.keyword.overview(userId);
  }
}
