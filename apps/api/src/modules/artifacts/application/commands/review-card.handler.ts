import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from 'neverthrow';

import {
  ARTIFACT_TYPE,
  FLASHCARD_REVIEW_KIND,
  type FlashcardContent,
} from '@knowtis/shared-types';

import {
  ArtifactErrors,
  type ArtifactDomainError,
} from '../../domain/errors/artifact.errors';
import { FlashcardReviewedEvent } from '../../domain/events/flashcard-reviewed.event';
import type {
  ArtifactReadRepository,
  FlashcardProgressRepository,
} from '../../domain/ports/artifact.repository';
import {
  ARTIFACT_READ_REPOSITORY,
  FLASHCARD_PROGRESS_REPOSITORY,
} from '../../domain/ports/artifact.repository';
import { loadOwnedArtifact } from '../services/load-owned-artifact';
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
    private readonly progressRepo: FlashcardProgressRepository,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    input: ReviewCardInput
  ): Promise<Result<SM2Output, ArtifactDomainError>> {
    try {
      const owned = await loadOwnedArtifact(
        this.artifactRepo,
        input.artifactId,
        input.userId,
        ARTIFACT_TYPE.FLASHCARD_DECK
      );

      if (owned.isErr()) {
        return err(owned.error);
      }

      const deck = owned.value.content as FlashcardContent;
      if (input.cardIndex >= deck.cards.length) {
        return err(ArtifactErrors.invalidCardIndex(input.cardIndex));
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

      await this.progressRepo.recordReview({
        artifactId: input.artifactId,
        userId: input.userId,
        cardIndex: input.cardIndex,
        quality: input.quality,
        intervalBeforeDays: current.intervalDays,
        next,
      });

      const now = new Date();
      const kind = !cardProgress
        ? FLASHCARD_REVIEW_KIND.NEW
        : new Date(cardProgress.nextReview) <= now
          ? FLASHCARD_REVIEW_KIND.DUE
          : FLASHCARD_REVIEW_KIND.EARLY;

      this.eventEmitter.emit(
        FlashcardReviewedEvent.EVENT_NAME,
        new FlashcardReviewedEvent(
          input.artifactId,
          input.userId,
          input.quality,
          kind
        )
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
