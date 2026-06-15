import { Injectable, Logger } from '@nestjs/common';

import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import type { RetrievalPort } from '../../domain/ports/retrieval.port';
import type { AgentNote, NoteHit, NotesOverview } from '../../domain/retrieval';
import { HybridRetrievalAdapter } from './hybrid-retrieval.adapter';
import { KeywordRetrievalAdapter } from './keyword-retrieval.adapter';

@Injectable()
export class FeatureFlaggedRetrievalAdapter implements RetrievalPort {
  private readonly logger = new Logger(FeatureFlaggedRetrievalAdapter.name);

  constructor(
    private readonly flags: FeatureFlagsService,
    private readonly hybrid: HybridRetrievalAdapter,
    private readonly keyword: KeywordRetrievalAdapter
  ) {}

  async search(userId: string, query: string): Promise<NoteHit[]> {
    const enabled = await this.flags.isEnabled(
      FEATURE_FLAG_KEYS.AGENT_HYBRID_RETRIEVAL
    );
    if (!enabled) {
      return this.keyword.search(userId, query);
    }
    try {
      return await this.hybrid.search(userId, query);
    } catch (error) {
      this.logger.warn(
        'Hybrid retrieval failed; degrading to keyword',
        error instanceof Error ? error.stack : String(error)
      );
      return this.keyword.search(userId, query);
    }
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
