import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import type { Sql } from 'postgres';

import { detectPromptInjection } from '@knowtis/ai-gateway';
import { FEATURE_FLAG_KEYS } from '@knowtis/shared-types';

import type { EnvConfig } from '../../../../config/env.config';
import { DATABASE_CLIENT, runWithAdvisoryLock } from '../../../../database';
import { AIConfigService } from '../../../ai/application/services/ai-config.service';
import { AIRateLimitService } from '../../../ai/application/services/ai-rate-limit.service';
import {
  AI_STRUCTURED_OUTPUT_PROVIDER,
  type AIStructuredOutputProvider,
} from '../../../ai/domain/ports/ai-structured-output.port';
import {
  EMBEDDING_PORT,
  type EmbeddingPort,
} from '../../../ai/domain/ports/embedding.port';
import { FeatureFlagsService } from '../../../feature-flags/feature-flags.service';
import {
  buildReconcilePrompt,
  MEMORY_RECONCILE_SYSTEM,
  MemoryReconcileSchema,
  partitionOps,
} from '../../domain/memory-reconcile';
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from '../../domain/ports/conversation.repository';
import {
  MEMORY_REPOSITORY,
  type MemoryRepository,
} from '../../domain/ports/memory.repository';

const ADVISORY_LOCK_KEY = 778_493_002;
const INTERVAL_MS = 120_000;
const TRANSCRIPT_MESSAGES = 40;
const MAX_OUTPUT_TOKENS = 1024;

@Injectable()
export class MemoryExtractionTask {
  private readonly logger = new Logger(MemoryExtractionTask.name);

  constructor(
    @Inject(DATABASE_CLIENT) private readonly client: Sql,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly aiConfig: AIConfigService,
    private readonly flags: FeatureFlagsService,
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    @Inject(MEMORY_REPOSITORY) private readonly memory: MemoryRepository,
    @Inject(AI_STRUCTURED_OUTPUT_PROVIDER)
    private readonly structured: AIStructuredOutputProvider,
    @Inject(EMBEDDING_PORT) private readonly embed: EmbeddingPort,
    private readonly rateLimit: AIRateLimitService
  ) {}

  @Interval(INTERVAL_MS)
  async reconcile(): Promise<void> {
    if (!this.config.get('VOYAGE_API_KEY')) {
      return;
    }
    if (
      !(await this.flags.isEnabled(FEATURE_FLAG_KEYS.AGENT_LONGTERM_MEMORY))
    ) {
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
      const quiet = this.config.get('AI_MEMORY_QUIET_SECONDS');
      const batch = this.config.get('AI_MEMORY_BATCH_SIZE');
      const candidates = await this.conversations.findExtractable(quiet, batch);
      for (const conv of candidates) {
        try {
          await this.extractOne(conv.id, conv.userId);
        } catch (error) {
          this.logger.warn(
            `Memory extraction failed for conversation ${conv.id}`,
            error instanceof Error ? error.stack : String(error)
          );
        }
      }
      if (candidates.length > 0) {
        this.logger.log(
          `Memory extraction processed ${candidates.length} conversations`
        );
      }
    } catch (error) {
      this.logger.error(
        'Memory extraction reconcile failed',
        error instanceof Error ? error.stack : String(error)
      );
    }
  }

  private async extractOne(
    conversationId: string,
    userId: string
  ): Promise<void> {
    const max = this.config.get('AI_MEMORY_MAX_PER_USER');
    const messages = await this.conversations.loadMessages(
      conversationId,
      TRANSCRIPT_MESSAGES
    );
    if (messages.length === 0) {
      await this.conversations.markExtracted(userId, conversationId);
      return;
    }
    const transcript = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');
    const existing = await this.memory.listForUser(userId, max);
    const { object } = await this.structured.generateStructuredOutput(
      buildReconcilePrompt(transcript, existing),
      MemoryReconcileSchema,
      {
        model: await this.aiConfig.getFastModel(),
        system: MEMORY_RECONCILE_SYSTEM,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
      }
    );
    const { adds, updates, deletes } = partitionOps(
      object.operations,
      existing.map((m) => m.id)
    );

    // Memories are a persistent injection vector: re-screen LLM-extracted
    // content before it can be stored and replayed into future prompts.
    const safeAdds = adds.filter((c) => detectPromptInjection(c).safe);
    const safeUpdates = updates.filter(
      (u) => detectPromptInjection(u.content).safe
    );

    const inserts: { content: string; embedding: number[] }[] = [];
    const memoryUpdates: {
      id: string;
      content: string;
      embedding: number[];
    }[] = [];
    // Compute every fallible external value (embeddings) before any write so
    // applyReconcile commits delete/insert/update atomically or not at all.
    if (safeAdds.length + safeUpdates.length > 0) {
      const texts = [...safeAdds, ...safeUpdates.map((u) => u.content)];
      const { embeddings, costUsd } = await this.embed.embedDocuments(texts);
      void this.rateLimit.recordGlobalCost(costUsd);
      const count = await this.memory.countForUser(userId);
      const capacity = Math.max(0, max - (count - deletes.length));
      let i = 0;
      for (const content of safeAdds) {
        const embedding = embeddings[i];
        i++;
        if (embedding && inserts.length < capacity) {
          inserts.push({ content, embedding });
        }
      }
      for (const u of safeUpdates) {
        const embedding = embeddings[i];
        i++;
        if (embedding) {
          memoryUpdates.push({ id: u.id, content: u.content, embedding });
        }
      }
    }

    await this.memory.applyReconcile({
      userId,
      sourceConversationId: conversationId,
      deletes,
      inserts,
      updates: memoryUpdates,
    });
    await this.conversations.markExtracted(userId, conversationId);
  }
}
