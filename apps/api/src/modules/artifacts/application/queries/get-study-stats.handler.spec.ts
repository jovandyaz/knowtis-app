import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FlashcardProgressRepository } from '../../domain/ports/artifact.repository';
import { GetStudyStatsHandler } from './get-study-stats.handler';

describe('GetStudyStatsHandler', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-06T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('maps repository activity to stats for the given zone', async () => {
    const getStudyActivity = vi.fn().mockResolvedValue({
      dueCount: 3,
      newCount: 5,
      totalCardsStudied: 9,
      nextDueAt: new Date('2026-09-07T09:00:00.000Z'),
      activeDays: [{ day: '2026-09-06', reviews: 2 }],
    });
    const handler = new GetStudyStatsHandler({
      getStudyActivity,
    } as unknown as FlashcardProgressRepository);

    const stats = await handler.execute({ userId: 'user-1', timeZone: 'UTC' });

    expect(getStudyActivity).toHaveBeenCalledWith('user-1', 'UTC');
    expect(stats.dueCount).toBe(3);
    expect(stats.nextDueAt).toBe('2026-09-07T09:00:00.000Z');
    expect(stats.reviewedToday).toBe(2);
    expect(stats.currentStreak).toBe(1);
  });
});
