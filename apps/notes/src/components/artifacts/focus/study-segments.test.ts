import { describe, expect, it } from 'vitest';

import type { CardSessionStatus } from '@knowtis/shared-types';

import { toCardSegments, toQuizSegments } from './study-segments';

describe('toCardSegments', () => {
  it('marks only the current pending card and preserves outcome order', () => {
    const statuses: CardSessionStatus[] = [
      'wrong',
      'pending',
      'correct',
      'skipped',
      'pending',
    ];
    expect(toCardSegments(statuses, 1, false)).toEqual([
      'wrong',
      'current',
      'correct',
      'skipped',
      'pending',
    ]);
    expect(statuses).toEqual([
      'wrong',
      'pending',
      'correct',
      'skipped',
      'pending',
    ]);
  });
  it.each(['correct', 'wrong', 'skipped'] as const)(
    'retains %s when browsing a settled card',
    (status) => {
      expect(toCardSegments([status, 'pending'], 0, false)).toEqual([
        status,
        'pending',
      ]);
    }
  );
  it('never invents a current segment in completed or empty input', () => {
    expect(toCardSegments(['pending', 'correct'], 0, true)).toEqual([
      'pending',
      'correct',
    ]);
    expect(toCardSegments([], 0, false)).toEqual([]);
    expect(toCardSegments(['pending'], -1, false)).toEqual(['pending']);
  });
});

describe('toQuizSegments', () => {
  it('maps graded history and the current unanswered position without mutating input', () => {
    const statuses = [
      'correct',
      'incorrect',
      'unanswered',
      'unanswered',
    ] as const;
    expect(toQuizSegments(statuses, 2, false)).toEqual([
      'correct',
      'wrong',
      'current',
      'pending',
    ]);
    expect(statuses).toEqual([
      'correct',
      'incorrect',
      'unanswered',
      'unanswered',
    ]);
  });

  it('leaves a checked current question graded before Next is pressed', () => {
    expect(toQuizSegments(['incorrect', 'unanswered'], 0, false)).toEqual([
      'wrong',
      'pending',
    ]);
  });

  it('has no active pulse when complete, and no invented segment for an empty quiz', () => {
    expect(toQuizSegments(['correct', 'incorrect'], 1, true)).toEqual([
      'correct',
      'wrong',
    ]);
    expect(toQuizSegments(['unanswered'], 0, true)).toEqual(['pending']);
    expect(toQuizSegments([], 0, false)).toEqual([]);
  });
});
