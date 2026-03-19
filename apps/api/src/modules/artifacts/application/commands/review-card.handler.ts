import { Inject, Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { ARTIFACT_TYPE } from '@knowtis/shared-types';

import { ArtifactErrors, type ArtifactDomainError } from '../../domain/errors';
import type {
  ArtifactReadRepository,
  FlashcardProgressRepository,
} from '../../domain/ports';
import {
  ARTIFACT_READ_REPOSITORY,
  FLASHCARD_PROGRESS_REPOSITORY,
} from '../../domain/ports';
import {
  calculateNextReview,
  initializeProgress,
  type SM2Output,
} from '../services/spaced-repetition.service';

interface ReviewCardInput {
  artifactId: string;
  userId: string;
  cardIndex: number;
  quality: number;
}

@Injectable()
export class ReviewCardHandler {
  private readonly logger = new Logger(ReviewCardHandler.name);

  constructor(
    @Inject(ARTIFACT_READ_REPOSITORY)
    private readonly artifactRepo: ArtifactReadRepository,
    @Inject(FLASHCARD_PROGRESS_REPOSITORY)
    private readonly progressRepo: FlashcardProgressRepository
  ) {}

  async execute(
    input: ReviewCardInput
  ): Promise<Result<SM2Output, ArtifactDomainError>> {
    try {
      const artifact = await this.artifactRepo.findById(input.artifactId);

      if (!artifact || artifact.userId !== input.userId) {
        return err(ArtifactErrors.notFound(input.artifactId));
      }

      if (artifact.type !== ARTIFACT_TYPE.FLASHCARD_DECK) {
        return err(ArtifactErrors.invalidType(artifact.type));
      }

      const existingProgress = await this.progressRepo.getProgress(
        input.artifactId,
        input.userId
      );
      const cardProgress = existingProgress.find(
        (p) => p.cardIndex === input.cardIndex
      );

      const current = cardProgress ?? initializeProgress();
      const next = calculateNextReview({
        quality: input.quality,
        repetitions: current.repetitions,
        easeFactor: current.easeFactor,
        intervalDays: current.intervalDays,
      });

      await this.progressRepo.upsertProgress(
        input.artifactId,
        input.userId,
        input.cardIndex,
        {
          easeFactor: next.easeFactor,
          intervalDays: next.intervalDays,
          repetitions: next.repetitions,
          nextReview: next.nextReview,
        }
      );

      return ok(next);
    } catch (error) {
      this.logger.error({
        event: 'review_card.error',
        artifactId: input.artifactId,
        userId: input.userId,
        cardIndex: input.cardIndex,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return err(
        ArtifactErrors.internalError(
          error instanceof Error ? error.message : 'Failed to review card'
        )
      );
    }
  }
}
