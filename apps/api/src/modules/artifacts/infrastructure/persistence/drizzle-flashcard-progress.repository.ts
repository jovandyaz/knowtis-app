import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lte, sql } from 'drizzle-orm';

import type { FlashcardProgress } from '@knowtis/shared-types';

import { DATABASE_CONNECTION, type Database } from '../../../../database';
import { artifacts, flashcardProgress } from '../../../../database/schema';
import type { FlashcardProgressRepository } from '../../domain';
import { DEFAULT_DUE_CARDS_LIMIT } from '../../domain/ports';

@Injectable()
export class DrizzleFlashcardProgressRepository implements FlashcardProgressRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async getProgress(
    artifactId: string,
    userId: string
  ): Promise<FlashcardProgress[]> {
    const rows = await this.db
      .select()
      .from(flashcardProgress)
      .where(
        and(
          eq(flashcardProgress.artifactId, artifactId),
          eq(flashcardProgress.userId, userId)
        )
      );

    return rows.map((row) => ({
      artifactId: row.artifactId,
      cardIndex: row.cardIndex,
      easeFactor: Number(row.easeFactor),
      intervalDays: row.intervalDays,
      repetitions: row.repetitions,
      nextReview: row.nextReview.toISOString(),
    }));
  }

  async getDueCards(
    userId: string,
    limit = DEFAULT_DUE_CARDS_LIMIT
  ): Promise<
    { artifactId: string; cardIndex: number; artifactTitle: string }[]
  > {
    const rows = await this.db
      .select({
        artifactId: flashcardProgress.artifactId,
        cardIndex: flashcardProgress.cardIndex,
        artifactTitle: artifacts.title,
      })
      .from(flashcardProgress)
      .innerJoin(artifacts, eq(artifacts.id, flashcardProgress.artifactId))
      .where(
        and(
          eq(flashcardProgress.userId, userId),
          lte(flashcardProgress.nextReview, sql`now()`)
        )
      )
      .orderBy(flashcardProgress.nextReview)
      .limit(limit);

    return rows;
  }

  async upsertProgress(
    artifactId: string,
    userId: string,
    cardIndex: number,
    data: {
      easeFactor: number;
      intervalDays: number;
      repetitions: number;
      nextReview: Date;
    }
  ): Promise<void> {
    await this.db
      .insert(flashcardProgress)
      .values({
        artifactId,
        userId,
        cardIndex,
        easeFactor: data.easeFactor.toFixed(2),
        intervalDays: data.intervalDays,
        repetitions: data.repetitions,
        nextReview: data.nextReview,
        lastReviewed: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          flashcardProgress.artifactId,
          flashcardProgress.userId,
          flashcardProgress.cardIndex,
        ],
        set: {
          easeFactor: data.easeFactor.toFixed(2),
          intervalDays: data.intervalDays,
          repetitions: data.repetitions,
          nextReview: data.nextReview,
          lastReviewed: new Date(),
        },
      });
  }
}
