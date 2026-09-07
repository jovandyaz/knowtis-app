import type { EventEmitter2 } from '@nestjs/event-emitter';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SM2_QUALITY } from '@knowtis/shared-types';

import { ArtifactErrorCodes } from '../../domain/errors/artifact.errors';
import { FlashcardReviewedEvent } from '../../domain/events/flashcard-reviewed.event';
import type {
  ArtifactEntity,
  ArtifactReadRepository,
  FlashcardProgressRepository,
} from '../../domain/ports/artifact.repository';
import { ReviewCardHandler } from './review-card.handler';

const USER_ID = 'user-1';
const ARTIFACT_ID = 'artifact-1';
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const deck: ArtifactEntity = {
  id: ARTIFACT_ID,
  type: 'flashcard_deck',
  userId: USER_ID,
  sourceNoteId: 'note-1',
  title: 'Flashcards: Test',
  content: { cards: [{ front: 'Q', back: 'A', difficulty: 'easy' }] },
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('ReviewCardHandler', () => {
  let findById: ReturnType<typeof vi.fn>;
  let getProgress: ReturnType<typeof vi.fn>;
  let recordReview: ReturnType<typeof vi.fn>;
  let emit: ReturnType<typeof vi.fn>;
  let handler: ReviewCardHandler;

  beforeEach(() => {
    findById = vi.fn().mockResolvedValue(deck);
    getProgress = vi.fn().mockResolvedValue([]);
    recordReview = vi.fn().mockResolvedValue(undefined);
    emit = vi.fn();
    handler = new ReviewCardHandler(
      { findById } as unknown as ArtifactReadRepository,
      { getProgress, recordReview } as unknown as FlashcardProgressRepository,
      { emit } as unknown as EventEmitter2
    );
  });

  it('records a first review as a new card and emits the reviewed event', async () => {
    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      cardIndex: 0,
      quality: SM2_QUALITY.GOOD,
    });

    expect(result.isOk()).toBe(true);
    expect(recordReview).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: ARTIFACT_ID,
        userId: USER_ID,
        cardIndex: 0,
        quality: SM2_QUALITY.GOOD,
        intervalBeforeDays: 0,
        next: expect.objectContaining({ repetitions: 1, intervalDays: 1 }),
      })
    );
    const [eventName, event] = emit.mock.calls[0] as [
      string,
      FlashcardReviewedEvent,
    ];
    expect(eventName).toBe(FlashcardReviewedEvent.EVENT_NAME);
    expect(event.kind).toBe('new');
    expect(event.quality).toBe(SM2_QUALITY.GOOD);
  });

  it('marks a card with existing progress as due and passes its interval as the before value', async () => {
    getProgress.mockResolvedValue([
      {
        artifactId: ARTIFACT_ID,
        cardIndex: 0,
        easeFactor: 2.5,
        intervalDays: 6,
        repetitions: 2,
        nextReview: new Date(Date.now() - ONE_DAY_MS).toISOString(),
      },
    ]);

    await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      cardIndex: 0,
      quality: SM2_QUALITY.AGAIN,
    });

    expect(recordReview).toHaveBeenCalledWith(
      expect.objectContaining({ intervalBeforeDays: 6 })
    );
    const [, event] = emit.mock.calls[0] as [string, FlashcardReviewedEvent];
    expect(event.kind).toBe('due');
  });

  it('marks a card reviewed ahead of its schedule as early', async () => {
    getProgress.mockResolvedValue([
      {
        artifactId: ARTIFACT_ID,
        cardIndex: 0,
        easeFactor: 2.5,
        intervalDays: 6,
        repetitions: 2,
        nextReview: new Date(Date.now() + ONE_DAY_MS).toISOString(),
      },
    ]);

    await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      cardIndex: 0,
      quality: SM2_QUALITY.GOOD,
    });

    const [, event] = emit.mock.calls[0] as [string, FlashcardReviewedEvent];
    expect(event.kind).toBe('early');
  });

  it('rejects a card index beyond the deck without writing or emitting', async () => {
    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      cardIndex: 1,
      quality: SM2_QUALITY.GOOD,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.INVALID_CARD_INDEX
    );
    expect(recordReview).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it('rejects a deck the user does not own without writing or emitting', async () => {
    findById.mockResolvedValue({ ...deck, userId: 'someone-else' });

    const result = await handler.execute({
      artifactId: ARTIFACT_ID,
      userId: USER_ID,
      cardIndex: 0,
      quality: SM2_QUALITY.GOOD,
    });

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr().code).toBe(
      ArtifactErrorCodes.ARTIFACT_NOT_FOUND
    );
    expect(recordReview).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
