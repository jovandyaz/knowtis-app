import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../../database';
import { ArtifactErrorCodes } from '../../domain/errors/artifact.errors';
import type { RecordReviewInput } from '../../domain/ports/artifact.repository';
import { DrizzleFlashcardProgressRepository } from './drizzle-flashcard-progress.repository';

const REVIEW: RecordReviewInput = {
  artifactId: 'artifact-1',
  userId: 'user-1',
  cardIndex: 3,
  quality: 3,
  intervalBeforeDays: 1,
  next: {
    easeFactor: 2.5,
    intervalDays: 6,
    repetitions: 2,
    nextReview: new Date('2026-09-12T00:00:00.000Z'),
  },
};

describe('DrizzleFlashcardProgressRepository', () => {
  let repo: DrizzleFlashcardProgressRepository;
  let insertValues: ReturnType<typeof vi.fn>;
  let onConflictDoUpdate: ReturnType<typeof vi.fn>;
  let transaction: ReturnType<typeof vi.fn>;
  let reviewLogError: Error | null;

  beforeEach(() => {
    reviewLogError = null;
    onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    insertValues = vi.fn().mockImplementation(() => ({
      onConflictDoUpdate,
      then: (
        resolve: (value: unknown) => void,
        reject: (reason: unknown) => void
      ) => (reviewLogError ? reject(reviewLogError) : resolve(undefined)),
    }));
    const tx = { insert: vi.fn().mockReturnValue({ values: insertValues }) };
    transaction = vi
      .fn()
      .mockImplementation(async (fn: (t: unknown) => Promise<void>) => fn(tx));
    repo = new DrizzleFlashcardProgressRepository({
      transaction,
    } as unknown as Database);
  });

  it('records the review inside one transaction: progress upsert plus review log insert', async () => {
    const result = await repo.recordReview(REVIEW);

    expect(result.isOk()).toBe(true);
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledTimes(2);
    expect(onConflictDoUpdate).toHaveBeenCalledTimes(1);
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        artifactId: 'artifact-1',
        userId: 'user-1',
        cardIndex: 3,
        quality: 3,
        intervalBeforeDays: 1,
        intervalAfterDays: 6,
        easeAfter: '2.50',
      })
    );
  });

  it('stamps the upsert and the review log with the same instant', async () => {
    await repo.recordReview(REVIEW);

    const [[upsert], [review]] = insertValues.mock.calls as [
      [{ lastReviewed: Date }],
      [{ reviewedAt: Date }],
    ];

    expect(upsert.lastReviewed).toBeInstanceOf(Date);
    expect(review.reviewedAt).toBe(upsert.lastReviewed);
  });

  it('returns an error result and skips the review log when the progress upsert rejects', async () => {
    onConflictDoUpdate.mockRejectedValue(new Error('progress upsert failed'));

    const result = await repo.recordReview(REVIEW);

    expect(result._unsafeUnwrapErr()).toEqual({
      code: ArtifactErrorCodes.INTERNAL_ERROR,
      message: 'Internal error: progress upsert failed',
    });
    expect(insertValues).toHaveBeenCalledTimes(1);
    await expect(transaction.mock.results[0]?.value).rejects.toThrow(
      'progress upsert failed'
    );
  });

  it('returns an error result when the review log insert rejects', async () => {
    reviewLogError = new Error('review log insert failed');

    const result = await repo.recordReview(REVIEW);

    expect(result._unsafeUnwrapErr()).toEqual({
      code: ArtifactErrorCodes.INTERNAL_ERROR,
      message: 'Internal error: review log insert failed',
    });
    expect(insertValues).toHaveBeenCalledTimes(2);
    await expect(transaction.mock.results[0]?.value).rejects.toThrow(
      'review log insert failed'
    );
  });
});
