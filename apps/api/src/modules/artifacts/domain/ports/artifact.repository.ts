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
  }): Promise<Result<QuizAttempt, ArtifactDomainError>>;
  findByArtifact(artifactId: string, userId: string): Promise<QuizAttempt[]>;
}

export const DEFAULT_DUE_CARDS_LIMIT = 20;

export const ARTIFACT_READ_REPOSITORY = Symbol('ARTIFACT_READ_REPOSITORY');
export const ARTIFACT_WRITE_REPOSITORY = Symbol('ARTIFACT_WRITE_REPOSITORY');
export const FLASHCARD_PROGRESS_REPOSITORY = Symbol(
  'FLASHCARD_PROGRESS_REPOSITORY'
);
export const QUIZ_ATTEMPT_REPOSITORY = Symbol('QUIZ_ATTEMPT_REPOSITORY');
