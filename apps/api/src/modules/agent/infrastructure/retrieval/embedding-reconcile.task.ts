import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';

import type { EnvConfig } from '../../../../config/env.config';
import { DATABASE_CONNECTION, type Database } from '../../../../database';
import { AIRateLimitService } from '../../../ai/application/services/ai-rate-limit.service';
import {
  EMBEDDING_PORT,
  type EmbeddingPort,
} from '../../../ai/domain/ports/embedding.port';
import {
  NOTE_EMBEDDING_REPOSITORY,
  type NoteEmbeddingRepository,
  type StaleNote,
} from '../../domain/ports/note-embedding.repository';
import { buildEmbeddingText, embeddingInputHash } from './embedding-text';

const ADVISORY_LOCK_KEY = 778_493_001;
const QUIET_SECONDS = 90;
const BATCH_SIZE = 50;
const INTERVAL_MS = 120_000;
// Texts are capped at 28K chars (~7K tokens); 32 per request stays well under
// Voyage's 320K-token-per-request limit.
const EMBED_SUB_BATCH = 32;

interface PendingEmbedding {
  noteId: string;
  text: string;
  hash: string;
}

@Injectable()
export class EmbeddingReconcileTask {
  private readonly logger = new Logger(EmbeddingReconcileTask.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database,
    private readonly config: ConfigService<EnvConfig, true>,
    @Inject(NOTE_EMBEDDING_REPOSITORY)
    private readonly repo: NoteEmbeddingRepository,
    @Inject(EMBEDDING_PORT)
    private readonly embed: EmbeddingPort,
    private readonly rateLimit: AIRateLimitService
  ) {}

  @Interval(INTERVAL_MS)
  async reconcile(): Promise<void> {
    if (!this.config.get('VOYAGE_API_KEY')) {
      return;
    }
    const locked = await this.acquireLock();
    if (!locked) {
      return;
    }
    try {
      const model = this.config.get('AI_EMBEDDING_MODEL');
      const stale = await this.repo.findStaleNotes(
        model,
        QUIET_SECONDS,
        BATCH_SIZE
      );
      const { embedded, touched } = await this.reconcileStaleNotes(
        stale,
        model
      );
      if (embedded > 0 || touched > 0) {
        this.logger.log(
          `Reconciled note embeddings: ${embedded} embedded, ${touched} unchanged`
        );
      }
    } catch (error) {
      this.logger.error(
        'Embedding reconcile failed',
        error instanceof Error ? error.stack : String(error)
      );
    } finally {
      await this.releaseLock();
    }
  }

  private async reconcileStaleNotes(
    stale: StaleNote[],
    model: string
  ): Promise<{ embedded: number; touched: number }> {
    const pending: PendingEmbedding[] = [];
    let touched = 0;
    for (const note of stale) {
      const hash = embeddingInputHash(note.title, note.content, model);
      if (hash === note.inputHash) {
        await this.repo.touch(note.noteId);
        touched++;
      } else {
        pending.push({
          noteId: note.noteId,
          text: buildEmbeddingText(note.title, note.content),
          hash,
        });
      }
    }
    let embedded = 0;
    for (let i = 0; i < pending.length; i += EMBED_SUB_BATCH) {
      embedded += await this.embedChunk(
        pending.slice(i, i + EMBED_SUB_BATCH),
        model
      );
    }
    return { embedded, touched };
  }

  private async embedChunk(
    chunk: PendingEmbedding[],
    model: string
  ): Promise<number> {
    let embeddings: number[][];
    try {
      const result = await this.embed.embedDocuments(chunk.map((c) => c.text));
      embeddings = result.embeddings;
      void this.rateLimit.recordGlobalCost(result.costUsd);
    } catch (error) {
      this.logger.warn(
        `Failed to embed a batch of ${chunk.length} notes`,
        error instanceof Error ? error.stack : String(error)
      );
      return 0;
    }
    let count = 0;
    for (let i = 0; i < chunk.length; i++) {
      const embedding = embeddings[i];
      if (!embedding) {
        this.logger.warn(
          `Voyage returned no embedding for note ${chunk[i].noteId}`
        );
        continue;
      }
      try {
        await this.repo.upsert({
          noteId: chunk[i].noteId,
          embedding,
          model,
          inputHash: chunk[i].hash,
        });
        count++;
      } catch (error) {
        this.logger.warn(
          `Failed to persist embedding for note ${chunk[i].noteId}`,
          error instanceof Error ? error.stack : String(error)
        );
      }
    }
    return count;
  }

  private async acquireLock(): Promise<boolean> {
    const rows = (await this.db.execute(
      sql`SELECT pg_try_advisory_lock(${ADVISORY_LOCK_KEY}) AS locked`
    )) as unknown as { locked: boolean }[];
    return rows[0]?.locked === true;
  }

  private async releaseLock(): Promise<void> {
    await this.db.execute(sql`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY})`);
  }
}
