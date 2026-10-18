import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { estimateTokenCount } from '@knowtis/ai-gateway';
import type {
  MemoryEditRejectionReason,
  MemoryEditUnavailableReason,
} from '@knowtis/shared-types';

import type { EnvConfig } from '../../../config/env.config';
import { reasonOf } from '../../../core/errors/reason-of';
import { AIRateLimitService } from '../../ai/application/services/ai-rate-limit.service';
import type { AiExecutionContext } from '../../ai/domain/execution-context/ai-execution-context';
import {
  EMBEDDING_PORT,
  type EmbeddingPort,
  type EmbeddingResult,
} from '../../ai/domain/ports/embedding.port';
import { isStorableMemory } from '../domain/memory-content-policy';
import {
  MEMORY_REPOSITORY,
  type MemoryRepository,
} from '../domain/ports/memory.repository';
import { InjectionGuardService } from './injection-guard.service';

export const EDIT_MEMORY_OUTCOME = {
  EDITED: 'edited',
  NOT_FOUND: 'not_found',
  REJECTED: 'rejected',
  RATE_LIMITED: 'rate_limited',
  UNAVAILABLE: 'unavailable',
} as const;

export type EditMemoryOutcome =
  | { readonly kind: typeof EDIT_MEMORY_OUTCOME.EDITED }
  | { readonly kind: typeof EDIT_MEMORY_OUTCOME.NOT_FOUND }
  | {
      readonly kind: typeof EDIT_MEMORY_OUTCOME.REJECTED;
      readonly reason: MemoryEditRejectionReason;
    }
  | {
      readonly kind: typeof EDIT_MEMORY_OUTCOME.RATE_LIMITED;
      readonly reason: string | null;
    }
  | {
      readonly kind: typeof EDIT_MEMORY_OUTCOME.UNAVAILABLE;
      readonly reason: MemoryEditUnavailableReason;
    };

export interface EditMemoryInput {
  readonly userId: string;
  readonly memoryId: string;
  readonly content: string;
  /** The caller's execution context, resolved only once the edit is due to spend on screening and embedding. */
  readonly tierOf: () => Promise<AiExecutionContext>;
}

const CONTENT_POLICY = 'content_policy' satisfies MemoryEditRejectionReason;
const INJECTION = 'injection' satisfies MemoryEditRejectionReason;
const EDITED: EditMemoryOutcome = { kind: EDIT_MEMORY_OUTCOME.EDITED };
const NOT_FOUND: EditMemoryOutcome = { kind: EDIT_MEMORY_OUTCOME.NOT_FOUND };
const SCREENING_UNAVAILABLE: EditMemoryOutcome = {
  kind: EDIT_MEMORY_OUTCOME.UNAVAILABLE,
  reason: 'screening_unavailable',
};
const EMBEDDINGS_UNAVAILABLE: EditMemoryOutcome = {
  kind: EDIT_MEMORY_OUTCOME.UNAVAILABLE,
  reason: 'embeddings_unavailable',
};
const EMBEDDINGS_FAILED: EditMemoryOutcome = {
  kind: EDIT_MEMORY_OUTCOME.UNAVAILABLE,
  reason: 'embeddings_failed',
};
const NO_ESTIMATED_COST_USD = 0;
const NO_VECTOR_REASON = 'the embedding provider returned no vector';

function rejected(reason: MemoryEditRejectionReason): EditMemoryOutcome {
  return { kind: EDIT_MEMORY_OUTCOME.REJECTED, reason };
}

/**
 * Rewrites one of the caller's memories. The new text passes the same screening an extracted memory
 * does (the content policy, then the persistent injection guard, which refuses what its classifier
 * cannot decide) and is re-embedded, inside the caller's AI rate limit; the memory keeps the
 * conversation that last wrote it.
 */
@Injectable()
export class EditMemoryHandler {
  private readonly logger = new Logger(EditMemoryHandler.name);

  constructor(
    @Inject(MEMORY_REPOSITORY) private readonly memory: MemoryRepository,
    @Inject(EMBEDDING_PORT) private readonly embed: EmbeddingPort,
    private readonly injectionGuard: InjectionGuardService,
    private readonly rateLimit: AIRateLimitService,
    private readonly config: ConfigService<EnvConfig, true>
  ) {}

  async execute({
    userId,
    memoryId,
    content,
    tierOf,
  }: EditMemoryInput): Promise<EditMemoryOutcome> {
    const current = await this.memory.findForUser(userId, memoryId);
    if (!current) {
      return NOT_FOUND;
    }
    if (current.content === content) {
      return EDITED;
    }
    if (!isStorableMemory(content)) {
      return rejected(CONTENT_POLICY);
    }
    if (!this.embed.isConfigured()) {
      return EMBEDDINGS_UNAVAILABLE;
    }
    const execution = await tierOf();
    const limit = await this.rateLimit.checkLimit(execution, {
      tokens: estimateTokenCount(content),
      costUsd: NO_ESTIMATED_COST_USD,
    });
    if (!limit.allowed) {
      return {
        kind: EDIT_MEMORY_OUTCOME.RATE_LIMITED,
        reason: limit.reason ?? null,
      };
    }
    try {
      return await this.screenAndStore(execution, memoryId, content);
    } finally {
      await this.rateLimit.releaseReservation(execution, limit.reservation);
    }
  }

  private async screenAndStore(
    execution: AiExecutionContext,
    memoryId: string,
    content: string
  ): Promise<EditMemoryOutcome> {
    const verdict = await this.injectionGuard.guardPersistent(
      content,
      execution
    );
    if (verdict.degraded) {
      this.logger.warn({ event: 'agent.memory.edit_unscreened', memoryId });
      return SCREENING_UNAVAILABLE;
    }
    if (!verdict.safe) {
      return rejected(INJECTION);
    }
    const embedding = await this.embedEdit(execution, memoryId, content);
    if (!embedding) {
      return EMBEDDINGS_FAILED;
    }
    const updated = await this.memory.update(
      execution.subject.userId,
      memoryId,
      content,
      embedding
    );
    return updated ? EDITED : NOT_FOUND;
  }

  private async embedEdit(
    execution: AiExecutionContext,
    memoryId: string,
    content: string
  ): Promise<number[] | null> {
    let embedded: EmbeddingResult;
    try {
      embedded = await this.embed.embedDocuments([content]);
    } catch (error) {
      this.warnEmbeddingFailed(memoryId, reasonOf(error));
      return null;
    }
    await this.rateLimit.recordSideCost(execution, {
      action: 'embedding',
      model: this.config.get('AI_EMBEDDING_MODEL'),
      costUsd: embedded.costUsd,
    });
    const [embedding] = embedded.embeddings;
    if (!embedding) {
      this.warnEmbeddingFailed(memoryId, NO_VECTOR_REASON);
      return null;
    }
    return embedding;
  }

  private warnEmbeddingFailed(memoryId: string, error: string): void {
    this.logger.warn({
      event: 'agent.memory.edit_embedding_failed',
      memoryId,
      error,
    });
  }
}
