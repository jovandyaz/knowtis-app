import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import {
  ARTIFACT_TYPES,
  QUIZ_ATTEMPT_SCOPES,
  type ArtifactType,
  type QuizAttemptScope,
} from '@knowtis/shared-types';

import { notes } from './notes.schema';
import { users } from './users.schema';

export const artifactTypeEnum = pgEnum(
  'artifact_type',
  ARTIFACT_TYPES as [ArtifactType, ...ArtifactType[]]
);

export const artifacts = pgTable(
  'artifacts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: artifactTypeEnum('type').notNull(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sourceNoteId: uuid('source_note_id')
      .notNull()
      .references(() => notes.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    content: jsonb('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('artifacts_user_id_idx').on(table.userId),
    index('artifacts_source_note_id_idx').on(table.sourceNoteId),
    index('artifacts_type_idx').on(table.userId, table.type),
  ]
);

export type ArtifactRow = typeof artifacts.$inferSelect;
export type NewArtifactRow = typeof artifacts.$inferInsert;

export const flashcardProgress = pgTable(
  'flashcard_progress',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    artifactId: uuid('artifact_id')
      .notNull()
      .references(() => artifacts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    cardIndex: integer('card_index').notNull(),
    easeFactor: numeric('ease_factor', { precision: 4, scale: 2 })
      .notNull()
      .default('2.5'),
    intervalDays: integer('interval_days').notNull().default(0),
    repetitions: integer('repetitions').notNull().default(0),
    nextReview: timestamp('next_review', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastReviewed: timestamp('last_reviewed', { withTimezone: true }),
  },
  (table) => [
    unique('flashcard_progress_unique').on(
      table.artifactId,
      table.userId,
      table.cardIndex
    ),
    index('flashcard_progress_review_idx').on(table.userId, table.nextReview),
  ]
);

export type FlashcardProgressRow = typeof flashcardProgress.$inferSelect;
export type NewFlashcardProgressRow = typeof flashcardProgress.$inferInsert;

export const quizAttempts = pgTable(
  'quiz_attempts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    artifactId: uuid('artifact_id')
      .notNull()
      .references(() => artifacts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    score: numeric('score', { precision: 5, scale: 2 }).notNull(),
    answers: jsonb('answers').notNull(),
    scope: text('scope').$type<QuizAttemptScope>().notNull().default('full'),
    completedAt: timestamp('completed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('quiz_attempts_artifact_idx').on(table.artifactId),
    index('quiz_attempts_user_idx').on(table.userId),
    check(
      'quiz_attempts_scope_check',
      sql`${table.scope} in (${sql.raw(
        QUIZ_ATTEMPT_SCOPES.map((scope) => `'${scope}'`).join(', ')
      )})`
    ),
  ]
);

export type QuizAttemptRow = typeof quizAttempts.$inferSelect;
export type NewQuizAttemptRow = typeof quizAttempts.$inferInsert;

export const flashcardReviews = pgTable(
  'flashcard_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    artifactId: uuid('artifact_id')
      .notNull()
      .references(() => artifacts.id, { onDelete: 'cascade' }),
    cardIndex: integer('card_index').notNull(),
    quality: smallint('quality').notNull(),
    intervalBeforeDays: integer('interval_before_days').notNull(),
    intervalAfterDays: integer('interval_after_days').notNull(),
    easeAfter: numeric('ease_after', { precision: 4, scale: 2 }).notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('flashcard_reviews_user_reviewed_idx').on(
      table.userId,
      table.reviewedAt
    ),
    check(
      'flashcard_reviews_quality_check',
      sql`${table.quality} between 0 and 5`
    ),
  ]
);

export type FlashcardReviewRow = typeof flashcardReviews.$inferSelect;
export type NewFlashcardReviewRow = typeof flashcardReviews.$inferInsert;
