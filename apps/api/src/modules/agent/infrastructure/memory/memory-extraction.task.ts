import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import type { Sql } from 'postgres';

import type { EnvConfig } from '../../../../config/env.config';
import { reasonOf } from '../../../../core/errors/reason-of';
import { stackOf } from '../../../../core/errors/stack-of';
import { DATABASE_CLIENT, runWithAdvisoryLock } from '../../../../database';
import { AIConfigService } from '../../../ai/application/services/ai-config.service';
import { AIRateLimitService } from '../../../ai/application/services/ai-rate-limit.service';
import {
  EMBEDDING_PORT,
  type EmbeddingPort,
} from '../../../ai/domain/ports/embedding.port';
import { ExtractMemoriesHandler } from '../../application/extract-memories.handler';
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
  type ExtractableConversation,
  type ExtractionRetryPolicy,
} from '../../domain/ports/conversation.repository';

const ADVISORY_LOCK_KEY = 778_493_002;
const INTERVAL_MS = 120_000;

// A failure can land after the reconcile call was charged to the user, so each
// retry of the same conversation state may charge again: the cap bounds that.
const EXTRACTION_RETRY: ExtractionRetryPolicy = {
  maxAttempts: 3,
  backoffBaseSeconds: 1800,
};

@Injectable()
export class MemoryExtractionTask {
  private readonly logger = new Logger(MemoryExtractionTask.name);

  constructor(
    @Inject(DATABASE_CLIENT) private readonly client: Sql,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly aiConfig: AIConfigService,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    @Inject(EMBEDDING_PORT) private readonly embed: EmbeddingPort,
    private readonly rateLimit: AIRateLimitService,
    private readonly extractMemories: ExtractMemoriesHandler
  ) {}

  @Interval(INTERVAL_MS)
  async reconcile(): Promise<void> {
    if (!this.embed.isConfigured()) {
      return;
    }
    const { acquired } = await runWithAdvisoryLock(
      this.client,
      ADVISORY_LOCK_KEY,
      () => this.reconcileLocked()
    );
    if (!acquired) {
      this.logger.debug(
        'Memory extraction skipped: another run holds the lock'
      );
    }
  }

  private async reconcileLocked(): Promise<void> {
    try {
      if (await this.globalSpendExhausted()) {
        return;
      }
      const quiet = this.config.get('AI_MEMORY_QUIET_SECONDS');
      const batch = this.config.get('AI_MEMORY_BATCH_SIZE');
      const candidates = await this.conversations.findExtractable(
        quiet,
        batch,
        EXTRACTION_RETRY
      );
      let processed = 0;
      for (const conversation of candidates) {
        if (processed > 0 && (await this.globalSpendExhausted())) {
          break;
        }
        try {
          await this.extractMemories.execute({
            conversation,
            model: await this.aiConfig.getFastModel(),
            finalAttempt:
              conversation.attempts + 1 >= EXTRACTION_RETRY.maxAttempts,
          });
        } catch (error) {
          await this.recordFailure(conversation, error);
        }
        processed++;
      }
      if (processed > 0) {
        this.logger.log(
          `Memory extraction processed ${processed} conversations`
        );
      }
    } catch (error) {
      this.logger.error('Memory extraction reconcile failed', stackOf(error));
    }
  }

  private async recordFailure(
    { id: conversationId, userId, version }: ExtractableConversation,
    error: unknown
  ): Promise<void> {
    let attempts: number | null = null;
    try {
      attempts = await this.conversations.recordExtractionFailure(
        userId,
        conversationId,
        version
      );
    } catch (recordError) {
      this.logger.warn({
        event: 'agent.memory.extraction_failure_unrecorded',
        conversationId,
        reason: reasonOf(recordError),
      });
    }
    const abandoned =
      attempts !== null && attempts >= EXTRACTION_RETRY.maxAttempts;
    this.logger.warn({
      event: abandoned
        ? 'agent.memory.extraction_abandoned'
        : 'agent.memory.extraction_failed',
      conversationId,
      attempts,
      reason: reasonOf(error),
      stack: stackOf(error),
    });
  }

  private async globalSpendExhausted(): Promise<boolean> {
    if (!(await this.rateLimit.isGlobalSpendExhausted())) {
      return false;
    }
    this.logger.debug({
      event: 'agent.memory.extraction_skipped',
      reason: 'global_breaker',
    });
    return true;
  }
}
