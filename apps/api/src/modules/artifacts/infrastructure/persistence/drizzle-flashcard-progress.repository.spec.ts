import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../../database';
import { DrizzleFlashcardProgressRepository } from './drizzle-flashcard-progress.repository';

describe('DrizzleFlashcardProgressRepository', () => {
  let repo: DrizzleFlashcardProgressRepository;
  let insertValues: ReturnType<typeof vi.fn>;
  let onConflictDoUpdate: ReturnType<typeof vi.fn>;
  let transaction: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onConflictDoUpdate = vi.fn().mockResolvedValue(undefined);
    insertValues = vi.fn().mockImplementation(() => ({
      onConflictDoUpdate,
      then: (resolve: (value: unknown) => void) => resolve(undefined),
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
    await repo.recordReview({
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
    });

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
    await repo.recordReview({
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
    });

    const [[upsert], [review]] = insertValues.mock.calls as [
      [{ lastReviewed: Date }],
      [{ reviewedAt: Date }],
    ];

    expect(upsert.lastReviewed).toBeInstanceOf(Date);
    expect(review.reviewedAt).toBe(upsert.lastReviewed);
  });
});
