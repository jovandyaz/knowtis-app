import { describe, expect, it } from 'vitest';

import type { CardSessionStatus } from '@knowtis/shared-types';

import { toCardSegments } from './card-segments';

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
