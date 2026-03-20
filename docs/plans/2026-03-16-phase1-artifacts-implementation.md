# Phase 1: Artifacts + Smart Note Creation — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a unified artifact system (flashcards, quizzes, summaries, mind maps) generated from notes, plus smart note creation via `/learn` slash command and smart paste.

**Architecture:** New `artifacts` backend module following DDD/Clean Architecture (same pattern as `notes` and `ai` modules). Artifacts are generated via `generateObject` (Zod schemas) from note content using the existing AI SDK infrastructure. Frontend adds new slash commands and artifact viewer components.

**Tech Stack:** NestJS 11, Drizzle ORM, Vercel AI SDK (`generateObject`), Zod, React 19, TanStack Query, Tiptap, Zustand

---

## Task 1: Shared Types — Artifact Types & AI Actions

**Files:**

- Modify: `libs/shared/types/src/lib/ai.types.ts`
- Create: `libs/shared/types/src/lib/artifact.types.ts`
- Modify: `libs/shared/types/src/index.ts`

**Step 1: Add new AI actions to the shared types**

In `libs/shared/types/src/lib/ai.types.ts`, add these actions to the `AI_ACTION` object:

```typescript
export const AI_ACTION = {
  // ... existing actions
  GENERATE_FLASHCARDS: 'generate-flashcards',
  GENERATE_QUIZ: 'generate-quiz',
  GENERATE_SUMMARY: 'generate-summary',
  GENERATE_MIND_MAP: 'generate-mind-map',
  GENERATE_OUTLINE: 'generate-outline',
  LEARN_TOPIC: 'learn-topic',
} as const;
```

**Step 2: Create artifact types file**

Create `libs/shared/types/src/lib/artifact.types.ts`:

```typescript
export const ARTIFACT_TYPE = {
  FLASHCARD_DECK: 'flashcard_deck',
  QUIZ: 'quiz',
  SUMMARY: 'summary',
  MIND_MAP: 'mind_map',
  OUTLINE: 'outline',
} as const;

export const ARTIFACT_TYPES = Object.values(ARTIFACT_TYPE);
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export interface FlashcardContent {
  cards: {
    front: string;
    back: string;
    difficulty: 'easy' | 'medium' | 'hard';
  }[];
}

export interface QuizContent {
  questions: {
    question: string;
    options: string[];
    correctIndex: number;
    explanation: string;
  }[];
}

export interface SummaryContent {
  summary: string;
  keyPoints: string[];
}

export interface MindMapNode {
  label: string;
  children?: MindMapNode[];
}

export interface MindMapContent {
  root: string;
  children: MindMapNode[];
}

export interface OutlineContent {
  outline: string;
}

export type ArtifactContent =
  | FlashcardContent
  | QuizContent
  | SummaryContent
  | MindMapContent
  | OutlineContent;

export interface Artifact {
  id: string;
  type: ArtifactType;
  userId: string;
  sourceNoteId: string;
  title: string;
  content: ArtifactContent;
  createdAt: string;
  updatedAt: string;
}

export interface FlashcardProgress {
  artifactId: string;
  cardIndex: number;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
  nextReview: string;
}

export interface QuizAttempt {
  id: string;
  artifactId: string;
  score: number;
  answers: { questionIndex: number; selectedIndex: number; correct: boolean }[];
  completedAt: string;
}

export interface StudyStats {
  cardsDueToday: number;
  cardsReviewedToday: number;
  currentStreak: number;
  totalCardsStudied: number;
}
```

**Step 3: Export from index**

Add to `libs/shared/types/src/index.ts`:

```typescript
export * from './lib/artifact.types';
```

**Step 4: Run typecheck**

Run: `pnpm nx run shared-types:lint`
Expected: PASS

**Step 5: Commit**

```bash
git add libs/shared/types/
git commit -m "feat(shared-types): add artifact types and new AI actions"
```

---

## Task 2: Database Schema — Artifacts Tables

**Files:**

- Create: `apps/api/src/database/schema/artifacts.schema.ts`
- Modify: `apps/api/src/database/schema/index.ts`

**Step 1: Create the artifacts schema file**

Create `apps/api/src/database/schema/artifacts.schema.ts`:

```typescript
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { notes } from './notes.schema';
import { users } from './users.schema';

export const artifactTypeEnum = pgEnum('artifact_type', [
  'flashcard_deck',
  'quiz',
  'summary',
  'mind_map',
  'outline',
]);

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
    completedAt: timestamp('completed_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('quiz_attempts_artifact_idx').on(table.artifactId),
    index('quiz_attempts_user_idx').on(table.userId),
  ]
);

export type QuizAttemptRow = typeof quizAttempts.$inferSelect;
export type NewQuizAttemptRow = typeof quizAttempts.$inferInsert;
```

**Step 2: Export from schema index**

Add to `apps/api/src/database/schema/index.ts`:

```typescript
export * from './artifacts.schema';
```

**Step 3: Push schema to database**

Run: `pnpm db:push`
Expected: Tables `artifacts`, `flashcard_progress`, `quiz_attempts` created

**Step 4: Verify with Drizzle Studio**

Run: `pnpm db:studio`
Expected: New tables visible in the GUI

**Step 5: Commit**

```bash
git add apps/api/src/database/schema/
git commit -m "feat(db): add artifacts, flashcard_progress, and quiz_attempts tables"
```

---

## Task 3: Backend Domain Layer — Errors, Ports, Value Objects

**Files:**

- Create: `apps/api/src/modules/artifacts/domain/errors/artifact.errors.ts`
- Create: `apps/api/src/modules/artifacts/domain/errors/index.ts`
- Create: `apps/api/src/modules/artifacts/domain/value-objects/artifact-type.vo.ts`
- Create: `apps/api/src/modules/artifacts/domain/value-objects/index.ts`
- Create: `apps/api/src/modules/artifacts/domain/ports/artifact.repository.ts`
- Create: `apps/api/src/modules/artifacts/domain/ports/index.ts`
- Create: `apps/api/src/modules/artifacts/domain/schemas/artifact-output.schemas.ts`
- Create: `apps/api/src/modules/artifacts/domain/index.ts`

**Step 1: Write failing test for ArtifactType value object**

Create `apps/api/src/modules/artifacts/domain/value-objects/artifact-type.vo.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { ArtifactType } from './artifact-type.vo';

describe('ArtifactType', () => {
  it('should create a valid artifact type', () => {
    const result = ArtifactType.create('flashcard_deck');
    expect(result.isOk()).toBe(true);
    expect(result._unsafeUnwrap().value).toBe('flashcard_deck');
  });

  it('should reject invalid artifact type', () => {
    const result = ArtifactType.create('invalid_type');
    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe('INVALID_ARTIFACT_TYPE');
  });

  it('should accept all valid types', () => {
    const validTypes = [
      'flashcard_deck',
      'quiz',
      'summary',
      'mind_map',
      'outline',
    ];
    for (const type of validTypes) {
      expect(ArtifactType.create(type).isOk()).toBe(true);
    }
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm nx test api -- --run --testPathPattern="artifact-type.vo.spec"`
Expected: FAIL — module not found

**Step 3: Create domain errors**

Create `apps/api/src/modules/artifacts/domain/errors/artifact.errors.ts`:

```typescript
export interface ArtifactDomainError {
  readonly code: string;
  readonly message: string;
}

export const ArtifactErrorCodes = {
  INVALID_ARTIFACT_TYPE: 'INVALID_ARTIFACT_TYPE',
  ARTIFACT_NOT_FOUND: 'ARTIFACT_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  GENERATION_FAILED: 'GENERATION_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ArtifactErrorCode =
  (typeof ArtifactErrorCodes)[keyof typeof ArtifactErrorCodes];

function createArtifactError(
  code: ArtifactErrorCode,
  message: string
): ArtifactDomainError {
  return { code, message };
}

export const ArtifactErrors = {
  invalidType: (type: string) =>
    createArtifactError(
      ArtifactErrorCodes.INVALID_ARTIFACT_TYPE,
      `Invalid artifact type: ${type}`
    ),
  notFound: (id: string) =>
    createArtifactError(
      ArtifactErrorCodes.ARTIFACT_NOT_FOUND,
      `Artifact not found: ${id}`
    ),
  permissionDenied: (message = 'Permission denied') =>
    createArtifactError(ArtifactErrorCodes.PERMISSION_DENIED, message),
  generationFailed: (reason: string) =>
    createArtifactError(
      ArtifactErrorCodes.GENERATION_FAILED,
      `Artifact generation failed: ${reason}`
    ),
  internalError: (message: string) =>
    createArtifactError(
      ArtifactErrorCodes.INTERNAL_ERROR,
      `Internal error: ${message}`
    ),
} as const;
```

Create `apps/api/src/modules/artifacts/domain/errors/index.ts`:

```typescript
export * from './artifact.errors';
```

**Step 4: Create ArtifactType value object**

Create `apps/api/src/modules/artifacts/domain/value-objects/artifact-type.vo.ts`:

```typescript
import { err, ok, type Result } from 'neverthrow';

import {
  ARTIFACT_TYPES,
  type ArtifactType as ArtifactTypeEnum,
} from '@knowtis/shared-types';

import { ArtifactErrors, type ArtifactDomainError } from '../errors';

export class ArtifactType {
  private constructor(public readonly value: ArtifactTypeEnum) {}

  static create(type: string): Result<ArtifactType, ArtifactDomainError> {
    if (!type || !ARTIFACT_TYPES.includes(type as ArtifactTypeEnum)) {
      return err(ArtifactErrors.invalidType(type));
    }
    return ok(new ArtifactType(type as ArtifactTypeEnum));
  }

  toPrimitive(): ArtifactTypeEnum {
    return this.value;
  }
}
```

Create `apps/api/src/modules/artifacts/domain/value-objects/index.ts`:

```typescript
export { ArtifactType } from './artifact-type.vo';
```

**Step 5: Run test to verify it passes**

Run: `pnpm nx test api -- --run --testPathPattern="artifact-type.vo.spec"`
Expected: PASS

**Step 6: Create repository port**

Create `apps/api/src/modules/artifacts/domain/ports/artifact.repository.ts`:

```typescript
import type { Result } from 'neverthrow';

import type {
  ArtifactContent,
  ArtifactType,
  FlashcardProgress,
  QuizAttempt,
} from '@knowtis/shared-types';

import type { ArtifactDomainError } from '../errors';

export interface ArtifactEntity {
  id: string;
  type: ArtifactType;
  userId: string;
  sourceNoteId: string;
  title: string;
  content: ArtifactContent;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateArtifactData {
  type: ArtifactType;
  userId: string;
  sourceNoteId: string;
  title: string;
  content: ArtifactContent;
}

export interface ArtifactReadRepository {
  findById(id: string): Promise<ArtifactEntity | null>;
  findByNoteId(noteId: string, userId: string): Promise<ArtifactEntity[]>;
  findByUserId(userId: string): Promise<ArtifactEntity[]>;
}

export interface ArtifactWriteRepository {
  create(
    data: CreateArtifactData
  ): Promise<Result<ArtifactEntity, ArtifactDomainError>>;
  delete(
    id: string,
    userId: string
  ): Promise<Result<boolean, ArtifactDomainError>>;
}

export interface FlashcardProgressRepository {
  getProgress(artifactId: string, userId: string): Promise<FlashcardProgress[]>;
  getDueCards(
    userId: string,
    limit?: number
  ): Promise<
    { artifactId: string; cardIndex: number; artifactTitle: string }[]
  >;
  upsertProgress(
    artifactId: string,
    userId: string,
    cardIndex: number,
    data: {
      easeFactor: number;
      intervalDays: number;
      repetitions: number;
      nextReview: Date;
    }
  ): Promise<void>;
}

export interface QuizAttemptRepository {
  create(data: {
    artifactId: string;
    userId: string;
    score: number;
    answers: QuizAttempt['answers'];
  }): Promise<QuizAttempt>;
  findByArtifact(artifactId: string, userId: string): Promise<QuizAttempt[]>;
}

export const ARTIFACT_READ_REPOSITORY = Symbol('ARTIFACT_READ_REPOSITORY');
export const ARTIFACT_WRITE_REPOSITORY = Symbol('ARTIFACT_WRITE_REPOSITORY');
export const FLASHCARD_PROGRESS_REPOSITORY = Symbol(
  'FLASHCARD_PROGRESS_REPOSITORY'
);
export const QUIZ_ATTEMPT_REPOSITORY = Symbol('QUIZ_ATTEMPT_REPOSITORY');
```

Create `apps/api/src/modules/artifacts/domain/ports/index.ts`:

```typescript
export * from './artifact.repository';
```

**Step 7: Create Zod output schemas for AI generation**

Create `apps/api/src/modules/artifacts/domain/schemas/artifact-output.schemas.ts`:

```typescript
import { z } from 'zod';

export const flashcardDeckOutputSchema = z.object({
  cards: z.array(
    z.object({
      front: z
        .string()
        .describe('The question or prompt side of the flashcard'),
      back: z.string().describe('The answer or explanation side'),
      difficulty: z
        .enum(['easy', 'medium', 'hard'])
        .describe('Estimated difficulty for a learner'),
    })
  ),
});

export const quizOutputSchema = z.object({
  questions: z.array(
    z.object({
      question: z.string().describe('The quiz question'),
      options: z
        .array(z.string())
        .min(3)
        .max(5)
        .describe('Answer options (3-5 choices)'),
      correctIndex: z
        .number()
        .describe('Zero-based index of the correct option'),
      explanation: z
        .string()
        .describe('Brief explanation of why the answer is correct'),
    })
  ),
});

export const summaryOutputSchema = z.object({
  summary: z
    .string()
    .describe('A concise HTML-formatted summary of the content'),
  keyPoints: z
    .array(z.string())
    .describe('3-7 key takeaways as short bullet points'),
});

const mindMapNodeSchema: z.ZodType<{
  label: string;
  children?: { label: string; children?: unknown[] }[];
}> = z.object({
  label: z.string().describe('Node label text'),
  children: z
    .lazy(() => z.array(mindMapNodeSchema))
    .optional()
    .describe('Child nodes'),
});

export const mindMapOutputSchema = z.object({
  root: z.string().describe('Central topic of the mind map'),
  children: z
    .array(mindMapNodeSchema)
    .describe('First-level branches from the root'),
});

export const outlineOutputSchema = z.object({
  outline: z
    .string()
    .describe('Structured outline in HTML using <h2>, <h3>, <ul>, <li> tags'),
});

export const learnTopicOutputSchema = z.object({
  title: z.string().max(50).describe('Concise title for the note, 3-8 words'),
  content: z
    .string()
    .describe(
      'Educational HTML content with <h2> sections, <p> explanations, <ul> key points, and <code> for examples when relevant'
    ),
});
```

**Step 8: Create domain index**

Create `apps/api/src/modules/artifacts/domain/index.ts`:

```typescript
export * from './errors';
export * from './ports';
export * from './value-objects';
```

**Step 9: Run tests**

Run: `pnpm nx test api -- --run --testPathPattern="artifact-type.vo.spec"`
Expected: PASS

**Step 10: Commit**

```bash
git add apps/api/src/modules/artifacts/domain/
git commit -m "feat(artifacts): add domain layer — errors, ports, value objects, schemas"
```

---

## Task 4: Backend — AI System Prompts for Artifact Generation

**Files:**

- Modify: `apps/api/src/modules/ai/domain/constants/system-prompts.ts`
- Modify: `apps/api/src/modules/ai/domain/value-objects/ai-action.vo.ts` (indirectly via shared-types)

**Step 1: Add system prompts for each artifact action**

Append to the `SYSTEM_PROMPTS` object in `apps/api/src/modules/ai/domain/constants/system-prompts.ts`:

```typescript
'generate-flashcards': `You are a study assistant. Generate flashcards from the given content to help a student memorize and understand the key concepts.

<rules>
- Generate 10-20 flashcards depending on content density
- "front" should be a clear question or prompt
- "back" should be a concise, accurate answer
- Vary question types: definitions, comparisons, examples, fill-in-the-blank
- Assign difficulty based on concept complexity
- ${PRESERVE_LANGUAGE}
</rules>`,

'generate-quiz': `You are a study assistant. Generate a quiz from the given content to test a student's understanding.

<rules>
- Generate 8-12 questions depending on content density
- Each question should have 3-5 options with exactly one correct answer
- Include a brief explanation for the correct answer
- Mix question types: factual recall, conceptual understanding, application
- Distribute difficulty: ~30% easy, ~50% medium, ~20% hard
- ${PRESERVE_LANGUAGE}
</rules>`,

'generate-summary': `You are a study assistant. Create a concise summary of the given content with key takeaways.

<rules>
- Summary should be 20-30% of the original length
- Use HTML formatting: <p> for paragraphs, <strong> for emphasis
- Extract 3-7 key points as short bullet statements
- Preserve the most important ideas, examples, and conclusions
- ${PRESERVE_LANGUAGE}
</rules>`,

'generate-mind-map': `You are a study assistant. Create a mind map structure from the given content.

<rules>
- "root" is the central topic (2-5 words)
- First-level children are main themes/categories (3-7 branches)
- Second-level children are sub-topics or details (2-5 per branch)
- Third level only if necessary (keep it focused)
- Labels should be concise (1-6 words each)
- ${PRESERVE_LANGUAGE}
</rules>`,

'generate-outline': `You are a study assistant. Create a structured outline of the given content.

<rules>
- Use HTML structure: <h2> for main sections, <h3> for subsections
- Use <ul>/<li> for bullet points under each section
- Preserve the logical flow and hierarchy of the original content
- Include brief annotations where context helps understanding
- ${PRESERVE_LANGUAGE}
</rules>`,

'learn-topic': `You are an educational content creator. Generate a comprehensive study note about the given topic.

<rules>
- Start with a brief introduction paragraph explaining what the topic is and why it matters
- Use <h2> sections for main concepts (3-5 sections)
- Include practical examples with <code> blocks when relevant
- Add a "Common Pitfalls" or "Key Takeaways" section at the end
- Use <ul>/<li> for lists, <strong> for important terms
- Content should be suitable for a student learning the topic for the first time
- Be accurate and educational, not superficial
- ${PRESERVE_LANGUAGE}
</rules>`,
```

**Step 2: Run typecheck to verify the actions exist in shared-types**

Run: `pnpm typecheck`
Expected: PASS (new actions already added in Task 1)

**Step 3: Commit**

```bash
git add apps/api/src/modules/ai/domain/constants/system-prompts.ts
git commit -m "feat(ai): add system prompts for artifact generation and learn-topic"
```

---

## Task 5: Backend — Artifact Repository (Drizzle Implementation)

**Files:**

- Create: `apps/api/src/modules/artifacts/infrastructure/persistence/drizzle-artifact.repository.ts`
- Create: `apps/api/src/modules/artifacts/infrastructure/persistence/index.ts`
- Create: `apps/api/src/modules/artifacts/infrastructure/index.ts`

**Step 1: Create the Drizzle repository implementation**

Create `apps/api/src/modules/artifacts/infrastructure/persistence/drizzle-artifact.repository.ts`:

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, lte } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { err, ok, type Result } from 'neverthrow';

import type {
  ArtifactContent,
  ArtifactType,
  QuizAttempt,
} from '@knowtis/shared-types';

import { DATABASE_CONNECTION } from '../../../../database';
import {
  artifacts,
  flashcardProgress,
  quizAttempts,
} from '../../../../database/schema';
import { ArtifactErrors, type ArtifactDomainError } from '../../domain/errors';
import type {
  ArtifactEntity,
  ArtifactReadRepository,
  ArtifactWriteRepository,
  CreateArtifactData,
  FlashcardProgressRepository,
  QuizAttemptRepository,
} from '../../domain/ports';

@Injectable()
export class DrizzleArtifactRepository
  implements
    ArtifactReadRepository,
    ArtifactWriteRepository,
    FlashcardProgressRepository,
    QuizAttemptRepository
{
  private readonly logger = new Logger(DrizzleArtifactRepository.name);

  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: NodePgDatabase
  ) {}

  async findById(id: string): Promise<ArtifactEntity | null> {
    const [row] = await this.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.id, id))
      .limit(1);
    return row ? this.toEntity(row) : null;
  }

  async findByNoteId(
    noteId: string,
    userId: string
  ): Promise<ArtifactEntity[]> {
    const rows = await this.db
      .select()
      .from(artifacts)
      .where(
        and(eq(artifacts.sourceNoteId, noteId), eq(artifacts.userId, userId))
      )
      .orderBy(desc(artifacts.createdAt));
    return rows.map((r) => this.toEntity(r));
  }

  async findByUserId(userId: string): Promise<ArtifactEntity[]> {
    const rows = await this.db
      .select()
      .from(artifacts)
      .where(eq(artifacts.userId, userId))
      .orderBy(desc(artifacts.createdAt));
    return rows.map((r) => this.toEntity(r));
  }

  async create(
    data: CreateArtifactData
  ): Promise<Result<ArtifactEntity, ArtifactDomainError>> {
    try {
      const [row] = await this.db
        .insert(artifacts)
        .values({
          type: data.type,
          userId: data.userId,
          sourceNoteId: data.sourceNoteId,
          title: data.title,
          content: data.content,
        })
        .returning();
      return ok(this.toEntity(row));
    } catch (error) {
      this.logger.error({
        event: 'artifact.create_failed',
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return err(ArtifactErrors.internalError('Failed to create artifact'));
    }
  }

  async delete(
    id: string,
    userId: string
  ): Promise<Result<boolean, ArtifactDomainError>> {
    try {
      const result = await this.db
        .delete(artifacts)
        .where(and(eq(artifacts.id, id), eq(artifacts.userId, userId)));
      if (result.rowCount === 0) {
        return err(ArtifactErrors.notFound(id));
      }
      return ok(true);
    } catch (error) {
      this.logger.error({
        event: 'artifact.delete_failed',
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return err(ArtifactErrors.internalError('Failed to delete artifact'));
    }
  }

  // --- Flashcard Progress ---

  async getProgress(
    artifactId: string,
    userId: string
  ): Promise<
    {
      artifactId: string;
      cardIndex: number;
      easeFactor: number;
      intervalDays: number;
      repetitions: number;
      nextReview: string;
    }[]
  > {
    const rows = await this.db
      .select()
      .from(flashcardProgress)
      .where(
        and(
          eq(flashcardProgress.artifactId, artifactId),
          eq(flashcardProgress.userId, userId)
        )
      );
    return rows.map((r) => ({
      artifactId: r.artifactId,
      cardIndex: r.cardIndex,
      easeFactor: Number(r.easeFactor),
      intervalDays: r.intervalDays,
      repetitions: r.repetitions,
      nextReview: r.nextReview.toISOString(),
    }));
  }

  async getDueCards(
    userId: string,
    limit = 20
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
          lte(flashcardProgress.nextReview, new Date())
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

  // --- Quiz Attempts ---

  async createAttempt(data: {
    artifactId: string;
    userId: string;
    score: number;
    answers: QuizAttempt['answers'];
  }): Promise<QuizAttempt> {
    const [row] = await this.db
      .insert(quizAttempts)
      .values({
        artifactId: data.artifactId,
        userId: data.userId,
        score: data.score.toFixed(2),
        answers: data.answers,
      })
      .returning();
    return {
      id: row.id,
      artifactId: row.artifactId,
      score: Number(row.score),
      answers: row.answers as QuizAttempt['answers'],
      completedAt: row.completedAt.toISOString(),
    };
  }

  async findByArtifact(
    artifactId: string,
    userId: string
  ): Promise<QuizAttempt[]> {
    const rows = await this.db
      .select()
      .from(quizAttempts)
      .where(
        and(
          eq(quizAttempts.artifactId, artifactId),
          eq(quizAttempts.userId, userId)
        )
      )
      .orderBy(desc(quizAttempts.completedAt));
    return rows.map((r) => ({
      id: r.id,
      artifactId: r.artifactId,
      score: Number(r.score),
      answers: r.answers as QuizAttempt['answers'],
      completedAt: r.completedAt.toISOString(),
    }));
  }

  private toEntity(row: typeof artifacts.$inferSelect): ArtifactEntity {
    return {
      id: row.id,
      type: row.type as ArtifactType,
      userId: row.userId,
      sourceNoteId: row.sourceNoteId,
      title: row.title,
      content: row.content as ArtifactContent,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
```

Create `apps/api/src/modules/artifacts/infrastructure/persistence/index.ts`:

```typescript
export { DrizzleArtifactRepository } from './drizzle-artifact.repository';
```

Create `apps/api/src/modules/artifacts/infrastructure/index.ts`:

```typescript
export * from './persistence';
```

**Step 2: Commit**

```bash
git add apps/api/src/modules/artifacts/infrastructure/
git commit -m "feat(artifacts): add Drizzle repository implementation"
```

---

## Task 6: Backend — Spaced Repetition Service (SM-2)

**Files:**

- Create: `apps/api/src/modules/artifacts/application/services/spaced-repetition.service.ts`
- Create: `apps/api/src/modules/artifacts/application/services/spaced-repetition.service.spec.ts`

**Step 1: Write failing tests for SM-2 algorithm**

Create `apps/api/src/modules/artifacts/application/services/spaced-repetition.service.spec.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import {
  calculateNextReview,
  initializeProgress,
} from './spaced-repetition.service';

describe('SpacedRepetitionService', () => {
  describe('initializeProgress', () => {
    it('should return default values for a new card', () => {
      const progress = initializeProgress();
      expect(progress.easeFactor).toBe(2.5);
      expect(progress.intervalDays).toBe(0);
      expect(progress.repetitions).toBe(0);
    });
  });

  describe('calculateNextReview', () => {
    it('should reset on quality < 3', () => {
      const result = calculateNextReview({
        quality: 1,
        repetitions: 5,
        easeFactor: 2.5,
        intervalDays: 30,
      });
      expect(result.repetitions).toBe(0);
      expect(result.intervalDays).toBe(1);
    });

    it('should set interval to 1 day on first correct answer', () => {
      const result = calculateNextReview({
        quality: 4,
        repetitions: 0,
        easeFactor: 2.5,
        intervalDays: 0,
      });
      expect(result.repetitions).toBe(1);
      expect(result.intervalDays).toBe(1);
    });

    it('should set interval to 6 days on second correct answer', () => {
      const result = calculateNextReview({
        quality: 4,
        repetitions: 1,
        easeFactor: 2.5,
        intervalDays: 1,
      });
      expect(result.repetitions).toBe(2);
      expect(result.intervalDays).toBe(6);
    });

    it('should multiply interval by ease factor after second repetition', () => {
      const result = calculateNextReview({
        quality: 4,
        repetitions: 2,
        easeFactor: 2.5,
        intervalDays: 6,
      });
      expect(result.repetitions).toBe(3);
      expect(result.intervalDays).toBe(15); // Math.round(6 * 2.5)
    });

    it('should decrease ease factor on quality 3', () => {
      const result = calculateNextReview({
        quality: 3,
        repetitions: 3,
        easeFactor: 2.5,
        intervalDays: 15,
      });
      expect(result.easeFactor).toBeLessThan(2.5);
      expect(result.easeFactor).toBeGreaterThanOrEqual(1.3);
    });

    it('should not let ease factor go below 1.3', () => {
      const result = calculateNextReview({
        quality: 3,
        repetitions: 3,
        easeFactor: 1.3,
        intervalDays: 10,
      });
      expect(result.easeFactor).toBe(1.3);
    });

    it('should return a nextReview date in the future', () => {
      const result = calculateNextReview({
        quality: 5,
        repetitions: 2,
        easeFactor: 2.5,
        intervalDays: 6,
      });
      expect(result.nextReview.getTime()).toBeGreaterThan(Date.now());
    });
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm nx test api -- --run --testPathPattern="spaced-repetition.service.spec"`
Expected: FAIL — module not found

**Step 3: Implement SM-2 algorithm**

Create `apps/api/src/modules/artifacts/application/services/spaced-repetition.service.ts`:

```typescript
interface SM2Input {
  quality: number; // 0-5
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
}

interface SM2Output {
  repetitions: number;
  easeFactor: number;
  intervalDays: number;
  nextReview: Date;
}

const MIN_EASE_FACTOR = 1.3;

export function initializeProgress() {
  return {
    easeFactor: 2.5,
    intervalDays: 0,
    repetitions: 0,
  };
}

export function calculateNextReview(input: SM2Input): SM2Output {
  const { quality, repetitions, easeFactor, intervalDays } = input;

  if (quality < 3) {
    // Failed — reset
    const newInterval = 1;
    return {
      repetitions: 0,
      easeFactor,
      intervalDays: newInterval,
      nextReview: addDays(new Date(), newInterval),
    };
  }

  // Correct answer — advance
  let newRepetitions = repetitions + 1;
  let newInterval: number;

  if (repetitions === 0) {
    newInterval = 1;
  } else if (repetitions === 1) {
    newInterval = 6;
  } else {
    newInterval = Math.round(intervalDays * easeFactor);
  }

  // Update ease factor: EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
  const newEaseFactor = Math.max(
    MIN_EASE_FACTOR,
    easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );

  return {
    repetitions: newRepetitions,
    easeFactor: Math.round(newEaseFactor * 100) / 100,
    intervalDays: newInterval,
    nextReview: addDays(new Date(), newInterval),
  };
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}
```

**Step 4: Run test to verify it passes**

Run: `pnpm nx test api -- --run --testPathPattern="spaced-repetition.service.spec"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/artifacts/application/services/
git commit -m "feat(artifacts): add SM-2 spaced repetition algorithm with tests"
```

---

## Task 7: Backend — Generate Artifact Handler

**Files:**

- Create: `apps/api/src/modules/artifacts/application/commands/generate-artifact.handler.ts`
- Create: `apps/api/src/modules/artifacts/application/commands/generate-artifact.handler.spec.ts`
- Create: `apps/api/src/modules/artifacts/application/commands/index.ts`
- Create: `apps/api/src/modules/artifacts/application/index.ts`

**Step 1: Write failing test**

Create `apps/api/src/modules/artifacts/application/commands/generate-artifact.handler.spec.ts`:

```typescript
import { err, ok } from 'neverthrow';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AIOrchestrator } from '../../../ai/application/services/ai-orchestrator.service';
import type { AIRateLimitService } from '../../../ai/application/services/ai-rate-limit.service';
import type { AIStructuredOutputProvider } from '../../../ai/domain/ports/ai-structured-output.port';
import { AIModel } from '../../../ai/domain/value-objects/ai-model.vo';
import type { ArtifactWriteRepository } from '../../domain/ports';
import { GenerateArtifactHandler } from './generate-artifact.handler';

describe('GenerateArtifactHandler', () => {
  let handler: GenerateArtifactHandler;
  let mockRepo: ArtifactWriteRepository;
  let mockStructuredOutput: AIStructuredOutputProvider;
  let mockOrchestrator: Partial<AIOrchestrator>;
  let mockRateLimit: Partial<AIRateLimitService>;

  beforeEach(() => {
    mockRepo = {
      create: vi.fn().mockResolvedValue(
        ok({
          id: 'artifact-1',
          type: 'flashcard_deck',
          userId: 'user-1',
          sourceNoteId: 'note-1',
          title: 'Flashcards: Test',
          content: { cards: [{ front: 'Q1', back: 'A1', difficulty: 'easy' }] },
          createdAt: new Date(),
          updatedAt: new Date(),
        })
      ),
      delete: vi.fn(),
    };

    mockStructuredOutput = {
      generateStructuredOutput: vi.fn().mockResolvedValue({
        object: { cards: [{ front: 'Q1', back: 'A1', difficulty: 'easy' }] },
        inputTokens: 500,
        outputTokens: 300,
      }),
    };

    mockOrchestrator = {
      selectModel: vi
        .fn()
        .mockReturnValue(
          ok(
            AIModel.create('anthropic:claude-sonnet-4-20250514')._unsafeUnwrap()
          )
        ),
      getSystemPrompt: vi.fn().mockReturnValue('You are a study assistant...'),
    };

    mockRateLimit = {
      checkLimit: vi.fn().mockResolvedValue({ allowed: true }),
      recordUsage: vi.fn().mockResolvedValue(undefined),
    };

    handler = new GenerateArtifactHandler(
      mockRepo,
      mockStructuredOutput as AIStructuredOutputProvider,
      mockOrchestrator as AIOrchestrator,
      mockRateLimit as AIRateLimitService
    );
  });

  it('should generate flashcards from note content', async () => {
    const result = await handler.execute({
      userId: 'user-1',
      noteId: 'note-1',
      noteContent: '<p>JWT is a token format...</p>',
      noteTitle: 'JWT Auth',
      type: 'flashcard_deck',
    });

    expect(result.isOk()).toBe(true);
    expect(mockStructuredOutput.generateStructuredOutput).toHaveBeenCalled();
    expect(mockRepo.create).toHaveBeenCalled();
  });

  it('should reject when rate limited', async () => {
    vi.mocked(mockRateLimit.checkLimit!).mockResolvedValue({
      allowed: false,
      reason: 'daily limit exceeded',
    });

    const result = await handler.execute({
      userId: 'user-1',
      noteId: 'note-1',
      noteContent: '<p>Content</p>',
      noteTitle: 'Test',
      type: 'flashcard_deck',
    });

    expect(result.isErr()).toBe(true);
  });
});
```

**Step 2: Run test to verify it fails**

Run: `pnpm nx test api -- --run --testPathPattern="generate-artifact.handler.spec"`
Expected: FAIL — module not found

**Step 3: Implement the handler**

Create `apps/api/src/modules/artifacts/application/commands/generate-artifact.handler.ts`:

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import type { ArtifactType } from '@knowtis/shared-types';

import { AIOrchestrator } from '../../../ai/application/services/ai-orchestrator.service';
import { AIRateLimitService } from '../../../ai/application/services/ai-rate-limit.service';
import { DEFAULT_MODEL_PRICING } from '../../../ai/domain/constants/model-pricing';
import { AIErrors } from '../../../ai/domain/errors/ai.errors';
import {
  AI_STRUCTURED_OUTPUT_PROVIDER,
  AIStructuredOutputProvider,
} from '../../../ai/domain/ports/ai-structured-output.port';
import { InputSanitizer } from '../../../ai/domain/services/input-sanitizer';
import { TokenEstimator } from '../../../ai/domain/services/token-estimator';
import { TokenUsage } from '../../../ai/domain/value-objects/token-usage.vo';
import type { ArtifactDomainError } from '../../domain/errors';
import { ArtifactErrors } from '../../domain/errors';
import {
  ARTIFACT_WRITE_REPOSITORY,
  type ArtifactEntity,
  type ArtifactWriteRepository,
} from '../../domain/ports';
import {
  flashcardDeckOutputSchema,
  mindMapOutputSchema,
  outlineOutputSchema,
  quizOutputSchema,
  summaryOutputSchema,
} from '../../domain/schemas/artifact-output.schemas';

interface GenerateArtifactInput {
  userId: string;
  noteId: string;
  noteContent: string;
  noteTitle: string;
  type: ArtifactType;
}

const ACTION_MAP: Record<ArtifactType, string> = {
  flashcard_deck: 'generate-flashcards',
  quiz: 'generate-quiz',
  summary: 'generate-summary',
  mind_map: 'generate-mind-map',
  outline: 'generate-outline',
};

const SCHEMA_MAP = {
  flashcard_deck: flashcardDeckOutputSchema,
  quiz: quizOutputSchema,
  summary: summaryOutputSchema,
  mind_map: mindMapOutputSchema,
  outline: outlineOutputSchema,
} as const;

const TITLE_PREFIX_MAP: Record<ArtifactType, string> = {
  flashcard_deck: 'Flashcards',
  quiz: 'Quiz',
  summary: 'Summary',
  mind_map: 'Mind Map',
  outline: 'Outline',
};

@Injectable()
export class GenerateArtifactHandler {
  private readonly logger = new Logger(GenerateArtifactHandler.name);

  constructor(
    @Inject(ARTIFACT_WRITE_REPOSITORY)
    private readonly repository: ArtifactWriteRepository,
    @Inject(AI_STRUCTURED_OUTPUT_PROVIDER)
    private readonly structuredOutput: AIStructuredOutputProvider,
    private readonly orchestrator: AIOrchestrator,
    private readonly rateLimitService: AIRateLimitService
  ) {}

  async execute(
    input: GenerateArtifactInput
  ): Promise<Result<ArtifactEntity, ArtifactDomainError>> {
    const action = ACTION_MAP[input.type];
    if (!action) {
      return err(ArtifactErrors.invalidType(input.type));
    }

    const sanitizedContent = InputSanitizer.stripHtml(input.noteContent);
    const estimatedTokens = TokenEstimator.estimate(sanitizedContent);

    const rateLimitCheck = await this.rateLimitService.checkLimit(
      input.userId,
      estimatedTokens
    );
    if (!rateLimitCheck.allowed) {
      return err(ArtifactErrors.generationFailed('Rate limit exceeded'));
    }

    const modelResult = this.orchestrator.selectModel(action);
    if (modelResult.isErr()) {
      return err(ArtifactErrors.generationFailed(modelResult.error.message));
    }
    const model = modelResult.value.toPrimitive();
    const systemPrompt = this.orchestrator.getSystemPrompt(action);
    const schema = SCHEMA_MAP[input.type];

    try {
      const result = await this.structuredOutput.generateStructuredOutput(
        sanitizedContent,
        schema,
        { model, system: systemPrompt }
      );

      const { inputTokens, outputTokens } = result;
      const usage = TokenUsage.create(
        { inputTokens, outputTokens, model },
        DEFAULT_MODEL_PRICING[model]
      );

      this.rateLimitService
        .recordUsage({
          userId: input.userId,
          action,
          model,
          estimatedTokens,
          inputTokens,
          outputTokens,
          costUsd: usage.costUsd,
        })
        .catch((error) =>
          this.logger.warn({
            event: 'artifact.usage_record_failed',
            userId: input.userId,
            error: error instanceof Error ? error.message : 'Unknown',
          })
        );

      const title = `${TITLE_PREFIX_MAP[input.type]}: ${input.noteTitle}`;

      return this.repository.create({
        type: input.type,
        userId: input.userId,
        sourceNoteId: input.noteId,
        title: title.slice(0, 255),
        content: result.object,
      });
    } catch (error) {
      this.logger.error({
        event: 'artifact.generation_failed',
        userId: input.userId,
        type: input.type,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return err(
        ArtifactErrors.generationFailed(
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
    }
  }
}
```

Create `apps/api/src/modules/artifacts/application/commands/index.ts`:

```typescript
export { GenerateArtifactHandler } from './generate-artifact.handler';
```

Create `apps/api/src/modules/artifacts/application/index.ts`:

```typescript
export * from './commands';
export * from './services/spaced-repetition.service';
```

**Step 4: Run test to verify it passes**

Run: `pnpm nx test api -- --run --testPathPattern="generate-artifact.handler.spec"`
Expected: PASS

**Step 5: Commit**

```bash
git add apps/api/src/modules/artifacts/application/
git commit -m "feat(artifacts): add generate artifact handler with rate limiting"
```

---

## Task 8: Backend — Artifact Query Handlers

**Files:**

- Create: `apps/api/src/modules/artifacts/application/queries/get-artifacts.handler.ts`
- Create: `apps/api/src/modules/artifacts/application/queries/get-study-session.handler.ts`
- Create: `apps/api/src/modules/artifacts/application/queries/index.ts`

These are straightforward read handlers. See the notes module `get-notes.handler.ts` pattern. Each handler injects the read repository and delegates to it.

**Step 1: Create query handlers**

Create `apps/api/src/modules/artifacts/application/queries/get-artifacts.handler.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';
import { ok, type Result } from 'neverthrow';

import type { ArtifactDomainError } from '../../domain/errors';
import {
  ARTIFACT_READ_REPOSITORY,
  type ArtifactEntity,
  type ArtifactReadRepository,
} from '../../domain/ports';

@Injectable()
export class GetArtifactsHandler {
  constructor(
    @Inject(ARTIFACT_READ_REPOSITORY)
    private readonly repository: ArtifactReadRepository
  ) {}

  async execute(input: {
    userId: string;
    noteId?: string;
  }): Promise<Result<ArtifactEntity[], ArtifactDomainError>> {
    const artifacts = input.noteId
      ? await this.repository.findByNoteId(input.noteId, input.userId)
      : await this.repository.findByUserId(input.userId);
    return ok(artifacts);
  }
}
```

Create `apps/api/src/modules/artifacts/application/queries/get-study-session.handler.ts`:

```typescript
import { Inject, Injectable } from '@nestjs/common';

import {
  FLASHCARD_PROGRESS_REPOSITORY,
  type FlashcardProgressRepository,
} from '../../domain/ports';

@Injectable()
export class GetStudySessionHandler {
  constructor(
    @Inject(FLASHCARD_PROGRESS_REPOSITORY)
    private readonly progressRepo: FlashcardProgressRepository
  ) {}

  async execute(input: { userId: string; limit?: number }) {
    return this.progressRepo.getDueCards(input.userId, input.limit ?? 20);
  }
}
```

Create `apps/api/src/modules/artifacts/application/queries/index.ts`:

```typescript
export { GetArtifactsHandler } from './get-artifacts.handler';
export { GetStudySessionHandler } from './get-study-session.handler';
```

Update `apps/api/src/modules/artifacts/application/index.ts`:

```typescript
export * from './commands';
export * from './queries';
export * from './services/spaced-repetition.service';
```

**Step 2: Commit**

```bash
git add apps/api/src/modules/artifacts/application/queries/
git commit -m "feat(artifacts): add query handlers for artifacts and study sessions"
```

---

## Task 9: Backend — DTOs, Controller & Module Wiring

**Files:**

- Create: `apps/api/src/modules/artifacts/dto/artifacts.dto.ts`
- Create: `apps/api/src/modules/artifacts/dto/index.ts`
- Create: `apps/api/src/modules/artifacts/artifacts.controller.ts`
- Create: `apps/api/src/modules/artifacts/artifacts.module.ts`
- Create: `apps/api/src/modules/artifacts/index.ts`
- Modify: `apps/api/src/app/app.module.ts`

**Step 1: Create DTOs**

Create `apps/api/src/modules/artifacts/dto/artifacts.dto.ts`:

```typescript
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { ARTIFACT_TYPES, type ArtifactType } from '@knowtis/shared-types';

export class GenerateArtifactDto {
  @ApiProperty({ description: 'Note ID to generate artifact from' })
  @IsUUID()
  noteId: string;

  @ApiProperty({
    enum: ARTIFACT_TYPES,
    description: 'Type of artifact to generate',
  })
  @IsEnum(ARTIFACT_TYPES)
  type: ArtifactType;
}

export class ReviewCardDto {
  @ApiProperty({ description: 'Card index in the deck' })
  @IsNumber()
  @Min(0)
  cardIndex: number;

  @ApiProperty({
    description: 'Quality of recall (0-5)',
    minimum: 0,
    maximum: 5,
  })
  @IsNumber()
  @Min(0)
  @Max(5)
  quality: number;
}

export class SubmitQuizDto {
  @ApiProperty({
    description: 'Array of answers',
    type: 'array',
    items: {
      type: 'object',
      properties: {
        questionIndex: { type: 'number' },
        selectedIndex: { type: 'number' },
      },
    },
  })
  answers: { questionIndex: number; selectedIndex: number }[];
}

export class ArtifactsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by note ID' })
  @IsOptional()
  @IsUUID()
  noteId?: string;
}
```

Create `apps/api/src/modules/artifacts/dto/index.ts`:

```typescript
export * from './artifacts.dto';
```

**Step 2: Create controller**

Create `apps/api/src/modules/artifacts/artifacts.controller.ts`:

```typescript
import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Result } from 'neverthrow';

import type { QuizContent } from '@knowtis/shared-types';

import { GetNoteHandler } from '../notes/application';
import { GenerateArtifactHandler } from './application/commands';
import {
  GetArtifactsHandler,
  GetStudySessionHandler,
} from './application/queries';
import {
  calculateNextReview,
  initializeProgress,
} from './application/services/spaced-repetition.service';
import { ArtifactErrorCodes, type ArtifactDomainError } from './domain/errors';
import {
  ARTIFACT_READ_REPOSITORY,
  ARTIFACT_WRITE_REPOSITORY,
  FLASHCARD_PROGRESS_REPOSITORY,
  QUIZ_ATTEMPT_REPOSITORY,
  type ArtifactReadRepository,
  type ArtifactWriteRepository,
  type FlashcardProgressRepository,
  type QuizAttemptRepository,
} from './domain/ports';
import {
  ArtifactsQueryDto,
  GenerateArtifactDto,
  ReviewCardDto,
  SubmitQuizDto,
} from './dto';

const ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [ArtifactErrorCodes.INVALID_ARTIFACT_TYPE]: HttpStatus.BAD_REQUEST,
  [ArtifactErrorCodes.ARTIFACT_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ArtifactErrorCodes.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [ArtifactErrorCodes.GENERATION_FAILED]: HttpStatus.BAD_GATEWAY,
  [ArtifactErrorCodes.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

function unwrapOrThrow<T>(result: Result<T, ArtifactDomainError>): T {
  if (result.isErr()) {
    const status =
      ERROR_STATUS_MAP[result.error.code] ?? HttpStatus.BAD_REQUEST;
    throw new HttpException(
      {
        statusCode: status,
        error: result.error.code,
        message: result.error.message,
      },
      status
    );
  }
  return result.value;
}

@ApiTags('Artifacts')
@ApiBearerAuth()
@Controller('artifacts')
@UseGuards(JwtAuthGuard)
export class ArtifactsController {
  constructor(
    private readonly generateHandler: GenerateArtifactHandler,
    private readonly getArtifactsHandler: GetArtifactsHandler,
    private readonly getStudySessionHandler: GetStudySessionHandler,
    private readonly getNoteHandler: GetNoteHandler,
    @Inject(ARTIFACT_READ_REPOSITORY)
    private readonly readRepo: ArtifactReadRepository,
    @Inject(ARTIFACT_WRITE_REPOSITORY)
    private readonly writeRepo: ArtifactWriteRepository,
    @Inject(FLASHCARD_PROGRESS_REPOSITORY)
    private readonly progressRepo: FlashcardProgressRepository,
    @Inject(QUIZ_ATTEMPT_REPOSITORY)
    private readonly quizRepo: QuizAttemptRepository
  ) {}

  @ApiOperation({ summary: 'Generate an artifact from a note' })
  @Post('generate')
  async generate(
    @CurrentUser() user: RequestUser,
    @Body() dto: GenerateArtifactDto
  ) {
    const noteResult = await this.getNoteHandler.execute({
      noteId: dto.noteId,
      userId: user.id,
    });
    if (noteResult.isErr()) {
      throw new HttpException('Note not found', HttpStatus.NOT_FOUND);
    }
    const note = noteResult.value;

    const result = await this.generateHandler.execute({
      userId: user.id,
      noteId: dto.noteId,
      noteContent: note.content,
      noteTitle: note.title,
      type: dto.type,
    });
    return unwrapOrThrow(result);
  }

  @ApiOperation({ summary: 'List artifacts' })
  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Query() query: ArtifactsQueryDto
  ) {
    const result = await this.getArtifactsHandler.execute({
      userId: user.id,
      noteId: query.noteId,
    });
    return unwrapOrThrow(result);
  }

  @ApiOperation({ summary: 'Get artifact by ID' })
  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    const artifact = await this.readRepo.findById(id);
    if (!artifact || artifact.userId !== user.id) {
      throw new HttpException('Artifact not found', HttpStatus.NOT_FOUND);
    }
    return artifact;
  }

  @ApiOperation({ summary: 'Delete an artifact' })
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.writeRepo.delete(id, user.id);
    return unwrapOrThrow(result);
  }

  @ApiOperation({ summary: 'Get cards due for review' })
  @Get('study/due')
  async getDueCards(@CurrentUser() user: RequestUser) {
    return this.getStudySessionHandler.execute({ userId: user.id });
  }

  @ApiOperation({ summary: 'Get flashcard progress for a deck' })
  @Get(':id/progress')
  async getProgress(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    return this.progressRepo.getProgress(id, user.id);
  }

  @ApiOperation({ summary: 'Submit a flashcard review' })
  @Post(':id/review')
  async reviewCard(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ReviewCardDto
  ) {
    const existing = await this.progressRepo.getProgress(id, user.id);
    const cardProgress = existing.find((p) => p.cardIndex === dto.cardIndex);

    const current = cardProgress ?? initializeProgress();
    const next = calculateNextReview({
      quality: dto.quality,
      repetitions: 'repetitions' in current ? current.repetitions : 0,
      easeFactor: current.easeFactor,
      intervalDays: current.intervalDays,
    });

    await this.progressRepo.upsertProgress(id, user.id, dto.cardIndex, next);
    return next;
  }

  @ApiOperation({ summary: 'Submit a quiz attempt' })
  @Post(':id/quiz-attempt')
  async submitQuiz(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: SubmitQuizDto
  ) {
    const artifact = await this.readRepo.findById(id);
    if (!artifact || artifact.type !== 'quiz') {
      throw new HttpException('Quiz not found', HttpStatus.NOT_FOUND);
    }

    const quiz = artifact.content as QuizContent;
    const gradedAnswers = dto.answers.map((a) => ({
      questionIndex: a.questionIndex,
      selectedIndex: a.selectedIndex,
      correct:
        quiz.questions[a.questionIndex]?.correctIndex === a.selectedIndex,
    }));

    const correctCount = gradedAnswers.filter((a) => a.correct).length;
    const score = (correctCount / quiz.questions.length) * 100;

    return this.quizRepo.create({
      artifactId: id,
      userId: user.id,
      score,
      answers: gradedAnswers,
    });
  }

  @ApiOperation({ summary: 'Get quiz attempt history' })
  @Get(':id/quiz-attempts')
  async getQuizAttempts(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    return this.quizRepo.findByArtifact(id, user.id);
  }
}
```

**Step 3: Create module**

Create `apps/api/src/modules/artifacts/artifacts.module.ts`:

```typescript
import { Module } from '@nestjs/common';

import { AIModule } from '../ai';
import { NotesModule } from '../notes';
import { GenerateArtifactHandler } from './application/commands';
import {
  GetArtifactsHandler,
  GetStudySessionHandler,
} from './application/queries';
import { ArtifactsController } from './artifacts.controller';
import {
  ARTIFACT_READ_REPOSITORY,
  ARTIFACT_WRITE_REPOSITORY,
  FLASHCARD_PROGRESS_REPOSITORY,
  QUIZ_ATTEMPT_REPOSITORY,
} from './domain/ports';
import { DrizzleArtifactRepository } from './infrastructure';

const ARTIFACT_REPOSITORY_PROVIDER = {
  provide: 'ARTIFACT_REPOSITORY',
  useClass: DrizzleArtifactRepository,
};

@Module({
  imports: [AIModule, NotesModule],
  controllers: [ArtifactsController],
  providers: [
    ARTIFACT_REPOSITORY_PROVIDER,
    {
      provide: ARTIFACT_READ_REPOSITORY,
      useExisting: 'ARTIFACT_REPOSITORY',
    },
    {
      provide: ARTIFACT_WRITE_REPOSITORY,
      useExisting: 'ARTIFACT_REPOSITORY',
    },
    {
      provide: FLASHCARD_PROGRESS_REPOSITORY,
      useExisting: 'ARTIFACT_REPOSITORY',
    },
    {
      provide: QUIZ_ATTEMPT_REPOSITORY,
      useExisting: 'ARTIFACT_REPOSITORY',
    },
    GenerateArtifactHandler,
    GetArtifactsHandler,
    GetStudySessionHandler,
  ],
})
export class ArtifactsModule {}
```

Create `apps/api/src/modules/artifacts/index.ts`:

```typescript
export { ArtifactsModule } from './artifacts.module';
```

**Step 4: Register in AppModule**

Add to `apps/api/src/app/app.module.ts`:

```typescript
import { ArtifactsModule } from '../modules/artifacts';

// Add ArtifactsModule to the imports array
```

**Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 6: Commit**

```bash
git add apps/api/src/modules/artifacts/ apps/api/src/app/app.module.ts
git commit -m "feat(artifacts): add controller, DTOs, module wiring"
```

---

## Task 10: Backend — Learn Topic Handler

**Files:**

- Create: `apps/api/src/modules/artifacts/application/commands/learn-topic.handler.ts`
- Modify: `apps/api/src/modules/artifacts/application/commands/index.ts`
- Modify: `apps/api/src/modules/artifacts/artifacts.controller.ts`
- Modify: `apps/api/src/modules/artifacts/artifacts.module.ts`

This handler is similar to the generate artifact handler but takes a **topic** string instead of note content, and returns generated HTML content (not a structured artifact). It uses `generateStructuredOutput` with `learnTopicOutputSchema`.

**Step 1: Create the handler**

Create `apps/api/src/modules/artifacts/application/commands/learn-topic.handler.ts`:

```typescript
import { Inject, Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { AIOrchestrator } from '../../../ai/application/services/ai-orchestrator.service';
import { AIRateLimitService } from '../../../ai/application/services/ai-rate-limit.service';
import { DEFAULT_MODEL_PRICING } from '../../../ai/domain/constants/model-pricing';
import {
  AI_STRUCTURED_OUTPUT_PROVIDER,
  AIStructuredOutputProvider,
} from '../../../ai/domain/ports/ai-structured-output.port';
import { TokenEstimator } from '../../../ai/domain/services/token-estimator';
import { TokenUsage } from '../../../ai/domain/value-objects/token-usage.vo';
import { ArtifactErrors, type ArtifactDomainError } from '../../domain/errors';
import { learnTopicOutputSchema } from '../../domain/schemas/artifact-output.schemas';

interface LearnTopicInput {
  userId: string;
  topic: string;
}

interface LearnTopicOutput {
  title: string;
  content: string;
}

@Injectable()
export class LearnTopicHandler {
  private readonly logger = new Logger(LearnTopicHandler.name);

  constructor(
    @Inject(AI_STRUCTURED_OUTPUT_PROVIDER)
    private readonly structuredOutput: AIStructuredOutputProvider,
    private readonly orchestrator: AIOrchestrator,
    private readonly rateLimitService: AIRateLimitService
  ) {}

  async execute(
    input: LearnTopicInput
  ): Promise<Result<LearnTopicOutput, ArtifactDomainError>> {
    const estimatedTokens = TokenEstimator.estimate(input.topic) + 2000;

    const rateLimitCheck = await this.rateLimitService.checkLimit(
      input.userId,
      estimatedTokens
    );
    if (!rateLimitCheck.allowed) {
      return err(ArtifactErrors.generationFailed('Rate limit exceeded'));
    }

    const modelResult = this.orchestrator.selectModel('learn-topic');
    if (modelResult.isErr()) {
      return err(ArtifactErrors.generationFailed(modelResult.error.message));
    }
    const model = modelResult.value.toPrimitive();
    const systemPrompt = this.orchestrator.getSystemPrompt('learn-topic');

    try {
      const result = await this.structuredOutput.generateStructuredOutput(
        `Topic to learn about: ${input.topic}`,
        learnTopicOutputSchema,
        { model, system: systemPrompt }
      );

      const { inputTokens, outputTokens } = result;
      const usage = TokenUsage.create(
        { inputTokens, outputTokens, model },
        DEFAULT_MODEL_PRICING[model]
      );

      this.rateLimitService
        .recordUsage({
          userId: input.userId,
          action: 'learn-topic',
          model,
          estimatedTokens,
          inputTokens,
          outputTokens,
          costUsd: usage.costUsd,
        })
        .catch((error) =>
          this.logger.warn({
            event: 'learn-topic.usage_record_failed',
            error: error instanceof Error ? error.message : 'Unknown',
          })
        );

      return ok({
        title: result.object.title,
        content: result.object.content,
      });
    } catch (error) {
      this.logger.error({
        event: 'learn-topic.generation_failed',
        userId: input.userId,
        topic: input.topic,
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return err(
        ArtifactErrors.generationFailed(
          error instanceof Error ? error.message : 'Unknown error'
        )
      );
    }
  }
}
```

**Step 2: Add endpoint to controller, DTO, and wire in module**

Add to DTO (`artifacts.dto.ts`):

```typescript
export class LearnTopicDto {
  @ApiProperty({ description: 'Topic to learn about' })
  @IsString()
  topic: string;
}
```

Add endpoint to controller:

```typescript
@ApiOperation({ summary: 'Generate educational content about a topic' })
@Post('learn')
async learnTopic(
  @CurrentUser() user: RequestUser,
  @Body() dto: LearnTopicDto
) {
  const result = await this.learnTopicHandler.execute({
    userId: user.id,
    topic: dto.topic,
  });
  return unwrapOrThrow(result);
}
```

Register `LearnTopicHandler` in `artifacts.module.ts` providers.

**Step 3: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS

**Step 4: Commit**

```bash
git add apps/api/src/modules/artifacts/
git commit -m "feat(artifacts): add learn-topic handler for /learn slash command"
```

---

## Tasks 11-15: Frontend (Summary — detailed when ready to implement)

The frontend tasks follow this order:

### Task 11: Data Access Library — API Client + React Query Hooks

- Create `libs/data-access/artifacts/` using nx generator (`nx g @nx/react:library data-access-artifacts --directory=libs/data-access/artifacts`)
- Add API client methods in `libs/api-client/` for all artifact endpoints
- Add React Query hooks: `useArtifacts`, `useGenerateArtifact`, `useReviewCard`, `useSubmitQuiz`, `useDueCards`

### Task 12: Slash Commands — `/flashcards`, `/quiz`, `/summary`, `/mindmap`, `/learn`

- Modify: `apps/notes/src/components/editor/ai/slash-commands.config.ts`
- Add new commands that trigger artifact generation via the API
- `/learn <topic>` inserts generated content at cursor

### Task 13: Artifact Viewer Components

- Create: `apps/notes/src/components/artifacts/ArtifactGenerator.tsx` — button + type selector modal
- Create: `apps/notes/src/components/artifacts/ArtifactList.tsx` — grid of artifacts for a note
- Create: `apps/notes/src/components/artifacts/FlashcardStudy.tsx` — flip card + swipe
- Create: `apps/notes/src/components/artifacts/QuizSession.tsx` — interactive quiz
- Create: `apps/notes/src/components/artifacts/MindMapViewer.tsx` — tree visualization
- Create: `apps/notes/src/components/artifacts/SummaryViewer.tsx` — formatted summary

### Task 14: Routes & Pages

- Create route: `apps/notes/src/routes/_app/artifacts/$artifactId.tsx`
- Create route: `apps/notes/src/routes/_app/study.tsx` (study session page with due cards)
- Add sidebar link for "Study" section
- Add artifact list to note editor page (collapsible panel)

### Task 15: Smart Paste

- Create Tiptap extension: detect paste >500 chars, show popover with restructure options
- Wire to existing AI actions (summarize, outline)

---

## Verification Checklist

After all tasks are complete, verify:

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm nx test api -- --run` passes
- [ ] `pnpm nx test notes -- --run` passes
- [ ] `pnpm db:push` succeeds (schema in sync)
- [ ] Swagger UI shows new `/artifacts/*` endpoints at `/api/docs`
- [ ] Generate flashcards from an existing note via API
- [ ] Generate quiz from an existing note via API
- [ ] Submit flashcard review and verify SM-2 interval calculation
- [ ] Submit quiz attempt and verify grading
- [ ] `/learn` slash command generates content in editor
- [ ] Smart paste detects long text and offers restructure options
