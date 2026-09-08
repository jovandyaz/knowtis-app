import { describe, expect, it } from 'vitest';

import { SM2_QUALITY } from '@knowtis/shared-types';

import { RATING_QUALITY } from './rating';

describe('RATING_QUALITY', () => {
  it('maps each rating key to its SM-2 quality', () => {
    expect(RATING_QUALITY).toEqual({
      again: SM2_QUALITY.AGAIN,
      hard: SM2_QUALITY.HARD,
      good: SM2_QUALITY.GOOD,
      easy: SM2_QUALITY.EASY,
    });
  });
});
