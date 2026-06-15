import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Interval } from '@nestjs/schedule';
import { sql } from 'drizzle-orm';

import type { EnvConfig } from '../../../../config/env.config';
import { DATABASE_CONNECTION, type Database } from '../../../../database';
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
    private readonly embed: EmbeddingPort
  ) {}

  @Interval(INTERVAL_MS)
  async reconcile(): Promise<void> {
    const locked = await this.acquireLock();
    if (!locked) {
      return;
    }
    try {
      const model = this.config.get('AI_EMBEDDING_MODEL');
      const stale = await this.repo.findStaleNotes(QUIET_SECONDS, BATCH_SIZE);
      for (const note of stale) {
        await this.reconcileNote(note, model);
      }
      if (stale.length > 0) {
        this.logger.log(`Reconciled ${stale.length} note embeddings`);
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

  private async reconcileNote(note: StaleNote, model: string): Promise<void> {
    const hash = embeddingInputHash(note.title, note.content, model);
    if (hash === note.inputHash) {
      await this.repo.touch(note.noteId);
      return;
    }
    const text = buildEmbeddingText(note.title, note.content);
    const { embeddings } = await this.embed.embedDocuments([text]);
    await this.repo.upsert({
      noteId: note.noteId,
      embedding: embeddings[0],
      model,
      inputHash: hash,
    });
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
