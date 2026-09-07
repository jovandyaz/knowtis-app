import { Inject, Injectable } from '@nestjs/common';
import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNull,
  lte,
  sql,
  type SQL,
} from 'drizzle-orm';
import { err, ok, type Result } from 'neverthrow';

import {
  ARTIFACT_TYPE,
  type FlashcardContent,
  type FlashcardDifficulty,
  type FlashcardProgress,
} from '@knowtis/shared-types';

import { DATABASE_CONNECTION, type Database } from '../../../../database';
import {
  artifacts,
  flashcardProgress,
  flashcardReviews,
  notes,
} from '../../../../database/schema';
import {
  ArtifactErrors,
  type ArtifactDomainError,
} from '../../domain/errors/artifact.errors';
import type {
  DeckStudyStateRow,
  DueCardRow,
  FlashcardDeckRow,
  FlashcardProgressRepository,
  RecordReviewInput,
  StudyActivity,
} from '../../domain/ports/artifact.repository';
import {
  MASTERY_MIN_REPETITIONS,
  STREAK_LOOKBACK_DAYS,
} from '../../domain/ports/artifact.repository';

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

  async findDueCards(userId: string, limit: number): Promise<DueCardRow[]> {
    const card = sql`${artifacts.content}->'cards'->${flashcardProgress.cardIndex}`;
    const rows = await this.db
      .select({
        artifactId: flashcardProgress.artifactId,
        cardIndex: flashcardProgress.cardIndex,
        noteId: artifacts.sourceNoteId,
        deckTitle: artifacts.title,
        bucket: notes.bucket,
        front: sql<string | null>`${card}->>'front'`,
        back: sql<string | null>`${card}->>'back'`,
        difficulty: sql<FlashcardDifficulty | null>`${card}->>'difficulty'`,
        easeFactor: flashcardProgress.easeFactor,
        intervalDays: flashcardProgress.intervalDays,
        repetitions: flashcardProgress.repetitions,
      })
      .from(flashcardProgress)
      .innerJoin(artifacts, eq(artifacts.id, flashcardProgress.artifactId))
      .innerJoin(notes, eq(notes.id, artifacts.sourceNoteId))
      .where(
        and(
          eq(flashcardProgress.userId, userId),
          lte(flashcardProgress.nextReview, sql`now()`),
          isNull(notes.deletedAt)
        )
      )
      .orderBy(
        flashcardProgress.nextReview,
        flashcardProgress.artifactId,
        flashcardProgress.cardIndex
      )
      .limit(limit);

    return rows.flatMap((row) =>
      row.front === null || row.back === null || row.difficulty === null
        ? []
        : [
            {
              artifactId: row.artifactId,
              cardIndex: row.cardIndex,
              noteId: row.noteId,
              deckTitle: row.deckTitle,
              bucket: row.bucket,
              front: row.front,
              back: row.back,
              difficulty: row.difficulty,
              easeFactor: Number(row.easeFactor),
              intervalDays: row.intervalDays,
              repetitions: row.repetitions,
            },
          ]
    );
  }

  async findFlashcardDecks(userId: string): Promise<FlashcardDeckRow[]> {
    const rows = await this.db
      .select({
        artifactId: artifacts.id,
        noteId: artifacts.sourceNoteId,
        deckTitle: artifacts.title,
        bucket: notes.bucket,
        content: artifacts.content,
        seenIndexes: sql<
          number[]
        >`coalesce(array_agg(${flashcardProgress.cardIndex}) filter (where ${flashcardProgress.cardIndex} is not null), '{}')`,
      })
      .from(artifacts)
      .innerJoin(notes, eq(notes.id, artifacts.sourceNoteId))
      .leftJoin(
        flashcardProgress,
        and(
          eq(flashcardProgress.artifactId, artifacts.id),
          eq(flashcardProgress.userId, userId)
        )
      )
      .where(
        and(
          eq(artifacts.userId, userId),
          eq(artifacts.type, ARTIFACT_TYPE.FLASHCARD_DECK),
          isNull(notes.deletedAt)
        )
      )
      .groupBy(artifacts.id, notes.bucket)
      .orderBy(desc(artifacts.createdAt));

    return rows.map((row) => ({
      artifactId: row.artifactId,
      noteId: row.noteId,
      deckTitle: row.deckTitle,
      bucket: row.bucket,
      cards: (row.content as FlashcardContent).cards,
      seenIndexes: row.seenIndexes,
    }));
  }

  async getDeckStudyStates(
    artifactIds: string[],
    userId: string
  ): Promise<DeckStudyStateRow[]> {
    if (artifactIds.length === 0) {
      return [];
    }

    return this.db
      .select({
        artifactId: flashcardProgress.artifactId,
        masteredCount: sql<number>`count(*) filter (where ${flashcardProgress.repetitions} >= ${MASTERY_MIN_REPETITIONS} and ${flashcardProgress.nextReview} > now())::int`,
        dueCount: sql<number>`count(*) filter (where ${flashcardProgress.nextReview} <= now())::int`,
      })
      .from(flashcardProgress)
      .where(
        and(
          eq(flashcardProgress.userId, userId),
          inArray(flashcardProgress.artifactId, artifactIds)
        )
      )
      .groupBy(flashcardProgress.artifactId);
  }

  async getStudyActivity(
    userId: string,
    timeZone: string
  ): Promise<StudyActivity> {
    // The postgres-js driver parses timestamptz transparently, leaving Drizzle's
    // column decoders to build the Date; a raw aggregate has none, so without
    // `mapWith` this comes back as the Postgres text form.
    const nextDueAt: SQL<Date | null> =
      sql`min(${flashcardProgress.nextReview}) filter (where ${flashcardProgress.nextReview} > now())`.mapWith(
        flashcardProgress.nextReview
      );

    const [progressRow] = await this.db
      .select({
        dueCount: sql<number>`count(*) filter (where ${flashcardProgress.nextReview} <= now())::int`,
        seenCount: sql<number>`count(*)::int`,
        nextDueAt,
      })
      .from(flashcardProgress)
      .innerJoin(artifacts, eq(artifacts.id, flashcardProgress.artifactId))
      .innerJoin(notes, eq(notes.id, artifacts.sourceNoteId))
      .where(
        and(eq(flashcardProgress.userId, userId), isNull(notes.deletedAt))
      );

    // Drizzle allocates a fresh bind placeholder per occurrence of an `sql`
    // fragment, and Postgres matches GROUP BY expressions structurally, so
    // repeating the `at time zone $tz` expression across SELECT/GROUP BY/ORDER BY
    // makes them unequal (42803). The CTE binds the zone once.
    const localDays = this.db.$with('local_days').as(
      this.db
        .select({
          day: sql<string>`to_char(${flashcardReviews.reviewedAt} at time zone ${timeZone}, 'YYYY-MM-DD')`.as(
            'day'
          ),
        })
        .from(flashcardReviews)
        .where(eq(flashcardReviews.userId, userId))
    );

    const [cardsRows, studiedRows, activeDays] = await Promise.all([
      this.db
        .select({
          totalCards: sql<number>`coalesce(sum(jsonb_array_length(${artifacts.content}->'cards')), 0)::int`,
        })
        .from(artifacts)
        .innerJoin(notes, eq(notes.id, artifacts.sourceNoteId))
        .where(
          and(
            eq(artifacts.userId, userId),
            eq(artifacts.type, ARTIFACT_TYPE.FLASHCARD_DECK),
            isNull(notes.deletedAt)
          )
        ),
      this.db
        .select({
          totalCardsStudied: sql<number>`count(distinct (${flashcardReviews.artifactId}, ${flashcardReviews.cardIndex}))::int`,
        })
        .from(flashcardReviews)
        .where(eq(flashcardReviews.userId, userId)),
      this.db
        .with(localDays)
        .select({ day: localDays.day, reviews: count() })
        .from(localDays)
        .groupBy(localDays.day)
        .orderBy(desc(localDays.day))
        .limit(STREAK_LOOKBACK_DAYS),
    ]);

    const cardsRow = cardsRows[0];
    const studiedRow = studiedRows[0];

    return {
      dueCount: progressRow?.dueCount ?? 0,
      newCount: Math.max(
        0,
        (cardsRow?.totalCards ?? 0) - (progressRow?.seenCount ?? 0)
      ),
      totalCardsStudied: studiedRow?.totalCardsStudied ?? 0,
      nextDueAt: progressRow?.nextDueAt ?? null,
      activeDays,
    };
  }

  async recordReview(
    input: RecordReviewInput
  ): Promise<Result<void, ArtifactDomainError>> {
    const reviewedAt = new Date();

    try {
      await this.db.transaction(async (tx) => {
        await tx
          .insert(flashcardProgress)
          .values({
            artifactId: input.artifactId,
            userId: input.userId,
            cardIndex: input.cardIndex,
            easeFactor: input.next.easeFactor.toFixed(2),
            intervalDays: input.next.intervalDays,
            repetitions: input.next.repetitions,
            nextReview: input.next.nextReview,
            lastReviewed: reviewedAt,
          })
          .onConflictDoUpdate({
            target: [
              flashcardProgress.artifactId,
              flashcardProgress.userId,
              flashcardProgress.cardIndex,
            ],
            set: {
              easeFactor: input.next.easeFactor.toFixed(2),
              intervalDays: input.next.intervalDays,
              repetitions: input.next.repetitions,
              nextReview: input.next.nextReview,
              lastReviewed: reviewedAt,
            },
          });

        await tx.insert(flashcardReviews).values({
          artifactId: input.artifactId,
          userId: input.userId,
          cardIndex: input.cardIndex,
          quality: input.quality,
          intervalBeforeDays: input.intervalBeforeDays,
          intervalAfterDays: input.next.intervalDays,
          easeAfter: input.next.easeFactor.toFixed(2),
          reviewedAt,
        });
      });
    } catch (error) {
      return err(
        ArtifactErrors.internalError(
          error instanceof Error ? error.message : 'Failed to record the review'
        )
      );
    }

    return ok(undefined);
  }
}
