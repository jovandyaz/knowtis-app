import { describe, expect, it } from 'vitest';

import { FLASHCARD_REVIEW_KIND } from '@knowtis/shared-types';

import { classifyReviewKind } from './review-kind';

const NOW = new Date('2026-09-06T12:00:00.000Z');

const progress = {
  artifactId: 'artifact-1',
  cardIndex: 0,
  easeFactor: 2.5,
  intervalDays: 6,
  repetitions: 2,
  nextReview: NOW.toISOString(),
};

describe('classifyReviewKind', () => {
  it('classifies a card without progress as new', () => {
    expect(classifyReviewKind(null, NOW)).toBe(FLASHCARD_REVIEW_KIND.NEW);
  });

  it('classifies a card whose next review has arrived as due', () => {
    expect(classifyReviewKind(progress, NOW)).toBe(FLASHCARD_REVIEW_KIND.DUE);
  });

  it('classifies a card reviewed ahead of its next review as early', () => {
    expect(
      classifyReviewKind(
        { ...progress, nextReview: '2026-09-07T12:00:00.000Z' },
        NOW
      )
    ).toBe(FLASHCARD_REVIEW_KIND.EARLY);
  });
});
