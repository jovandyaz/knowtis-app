import { Logger } from '@nestjs/common';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../../database';
import { failedQuery } from '../../../../test-support/database-errors';
import { ArtifactErrorCodes } from '../../domain/errors/artifact.errors';
import type { RecordReviewInput } from '../../domain/ports/artifact.repository';
import { DrizzleFlashcardProgressRepository } from './drizzle-flashcard-progress.repository';

const REVIEW_FAILED = {
  code: ArtifactErrorCodes.INTERNAL_ERROR,
  message: 'Internal error: Failed to record the review',
};

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
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

    expect(result._unsafeUnwrapErr()).toEqual(REVIEW_FAILED);
    expect(insertValues).toHaveBeenCalledTimes(1);
    await expect(transaction.mock.results[0]?.value).rejects.toThrow(
      'progress upsert failed'
    );
  });

  it('returns an error result when the review log insert rejects', async () => {
    reviewLogError = new Error('review log insert failed');

    const result = await repo.recordReview(REVIEW);

    expect(result._unsafeUnwrapErr()).toEqual(REVIEW_FAILED);
    expect(insertValues).toHaveBeenCalledTimes(2);
    await expect(transaction.mock.results[0]?.value).rejects.toThrow(
      'review log insert failed'
    );
  });

  it('logs a rejected review by its diagnostics, never by the values the query carried', async () => {
    const secret = 'sentinel-review-value';
    onConflictDoUpdate.mockRejectedValue(failedQuery([secret]));
    const log = vi.mocked(Logger.prototype.error);

    const result = await repo.recordReview(REVIEW);

    expect(result._unsafeUnwrapErr()).toEqual(REVIEW_FAILED);
    expect(log.mock.calls).toEqual([
      [
        {
          operation: 'recordFlashcardReview',
          artifactId: REVIEW.artifactId,
          userId: REVIEW.userId,
          cardIndex: REVIEW.cardIndex,
          errorName: 'DrizzleQueryError',
          failureCategory: 'unclassified',
          sqlState: '40P01',
        },
      ],
    ]);
    expect(JSON.stringify(log.mock.calls)).not.toContain(secret);
  });
});
