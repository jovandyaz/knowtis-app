import { Inject, Injectable } from '@nestjs/common';
import { ok, type Result } from 'neverthrow';

import { ARTIFACT_TYPE } from '@knowtis/shared-types';
import type {
  ArtifactStudyState,
  FlashcardContent,
} from '@knowtis/shared-types';

import type { ArtifactDomainError } from '../../domain/errors/artifact.errors';
import {
  ARTIFACT_READ_REPOSITORY,
  FLASHCARD_PROGRESS_REPOSITORY,
  QUIZ_ATTEMPT_REPOSITORY,
  type ArtifactEntity,
  type ArtifactReadRepository,
  type FlashcardProgressRepository,
  type QuizAttemptRepository,
} from '../../domain/ports/artifact.repository';

export type ArtifactEntityWithStudyState = ArtifactEntity & {
  studyState: ArtifactStudyState;
};

@Injectable()
export class GetArtifactsHandler {
  constructor(
    @Inject(ARTIFACT_READ_REPOSITORY)
    private readonly repository: ArtifactReadRepository,
    @Inject(FLASHCARD_PROGRESS_REPOSITORY)
    private readonly progressRepo: FlashcardProgressRepository,
    @Inject(QUIZ_ATTEMPT_REPOSITORY)
    private readonly quizAttemptRepo: QuizAttemptRepository
  ) {}

  async execute(input: {
    userId: string;
    noteId?: string;
  }): Promise<Result<ArtifactEntityWithStudyState[], ArtifactDomainError>> {
    const artifacts = input.noteId
      ? await this.repository.findByNoteId(input.noteId, input.userId)
      : await this.repository.findByUserId(input.userId);

    const deckIds = artifacts
      .filter((a) => a.type === ARTIFACT_TYPE.FLASHCARD_DECK)
      .map((a) => a.id);
    const quizIds = artifacts
      .filter((a) => a.type === ARTIFACT_TYPE.QUIZ)
      .map((a) => a.id);

    const [deckStates, latestQuizAttempts] = await Promise.all([
      this.progressRepo.getDeckStudyStates(deckIds, input.userId),
      this.quizAttemptRepo.findLatestFullByArtifacts(quizIds, input.userId),
    ]);

    const deckStateById = new Map(deckStates.map((s) => [s.artifactId, s]));
    const quizAttemptById = new Map(
      latestQuizAttempts.map((a) => [a.artifactId, a])
    );

    return ok(
      artifacts.map((artifact) => ({
        ...artifact,
        studyState: this.studyStateFor(
          artifact,
          deckStateById,
          quizAttemptById
        ),
      }))
    );
  }

  private studyStateFor(
    artifact: ArtifactEntity,
    deckStateById: Map<string, { masteredCount: number; dueCount: number }>,
    quizAttemptById: Map<string, { score: number; completedAt: string }>
  ): ArtifactStudyState {
    if (artifact.type === ARTIFACT_TYPE.FLASHCARD_DECK) {
      const state = deckStateById.get(artifact.id);
      return {
        masteredCount: state?.masteredCount ?? 0,
        totalCount: (artifact.content as FlashcardContent).cards.length,
        dueCount: state?.dueCount ?? 0,
      };
    }
    if (artifact.type === ARTIFACT_TYPE.QUIZ) {
      const attempt = quizAttemptById.get(artifact.id);
      return attempt
        ? { lastScore: attempt.score, lastAttemptAt: attempt.completedAt }
        : null;
    }
    return null;
  }
}
