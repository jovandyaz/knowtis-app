import type { Result } from 'neverthrow';

import type {
  ArtifactContent,
  ArtifactType,
  FlashcardContent,
  FlashcardDifficulty,
  FlashcardProgress,
  ParaBucket,
  QuizAttempt,
  QuizAttemptScope,
} from '@knowtis/shared-types';

import type { ArtifactDomainError } from '../errors/artifact.errors';

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
  findBySourceNoteId(noteId: string): Promise<ArtifactEntity[]>;
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

export interface DueCardRow {
  artifactId: string;
  cardIndex: number;
  noteId: string;
  deckTitle: string;
  bucket: ParaBucket | null;
  front: string;
  back: string;
  difficulty: FlashcardDifficulty;
  easeFactor: number;
  intervalDays: number;
  repetitions: number;
}

export interface FlashcardDeckRow {
  artifactId: string;
  noteId: string;
  deckTitle: string;
  bucket: ParaBucket | null;
  cards: FlashcardContent['cards'];
  seenIndexes: number[];
}

export interface DeckStudyStateRow {
  artifactId: string;
  masteredCount: number;
  dueCount: number;
}

export interface StudyActivity {
  dueCount: number;
  newCount: number;
  totalCardsStudied: number;
  nextDueAt: Date | null;
  /** Local calendar days with at least one review, newest first, with the review count of each. */
  activeDays: { day: string; reviews: number }[];
}

export interface RecordReviewInput {
  artifactId: string;
  userId: string;
  cardIndex: number;
  quality: number;
  intervalBeforeDays: number;
  next: {
    easeFactor: number;
    intervalDays: number;
    repetitions: number;
    nextReview: Date;
  };
}

export interface FlashcardProgressRepository {
  getProgress(artifactId: string, userId: string): Promise<FlashcardProgress[]>;
  findDueCards(userId: string, limit: number): Promise<DueCardRow[]>;
  findFlashcardDecks(userId: string): Promise<FlashcardDeckRow[]>;
  getDeckStudyStates(
    artifactIds: string[],
    userId: string
  ): Promise<DeckStudyStateRow[]>;
  getStudyActivity(userId: string, timeZone: string): Promise<StudyActivity>;
  recordReview(input: RecordReviewInput): Promise<void>;
}

export interface QuizAttemptRepository {
  create(data: {
    artifactId: string;
    userId: string;
    score: number;
    scope: QuizAttemptScope;
    answers: QuizAttempt['answers'];
  }): Promise<Result<QuizAttempt, ArtifactDomainError>>;
  findByArtifact(artifactId: string, userId: string): Promise<QuizAttempt[]>;
  findLatestFull(
    artifactId: string,
    userId: string
  ): Promise<QuizAttempt | null>;
  findLatestFullByArtifacts(
    artifactIds: string[],
    userId: string
  ): Promise<QuizAttempt[]>;
}

export const DUE_CARDS_PER_SESSION = 20;
export const NEW_CARDS_PER_SESSION = 10;
export const MASTERY_MIN_REPETITIONS = 2;
export const STREAK_LOOKBACK_DAYS = 400;
export const DEFAULT_STUDY_TIME_ZONE = 'UTC';

export const ARTIFACT_READ_REPOSITORY = Symbol('ARTIFACT_READ_REPOSITORY');
export const ARTIFACT_WRITE_REPOSITORY = Symbol('ARTIFACT_WRITE_REPOSITORY');
export const FLASHCARD_PROGRESS_REPOSITORY = Symbol(
  'FLASHCARD_PROGRESS_REPOSITORY'
);
export const QUIZ_ATTEMPT_REPOSITORY = Symbol('QUIZ_ATTEMPT_REPOSITORY');
