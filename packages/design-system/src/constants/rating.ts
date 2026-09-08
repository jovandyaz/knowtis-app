import {
  SM2_QUALITY,
  type PredictedIntervals,
  type SM2Quality,
} from '@knowtis/shared-types';

export const RATING_ORDER = [
  'again',
  'hard',
  'good',
  'easy',
] as const satisfies readonly (keyof PredictedIntervals)[];
export type RatingKey = (typeof RATING_ORDER)[number];

export const RATING_QUALITY = {
  again: SM2_QUALITY.AGAIN,
  hard: SM2_QUALITY.HARD,
  good: SM2_QUALITY.GOOD,
  easy: SM2_QUALITY.EASY,
} satisfies Record<RatingKey, SM2Quality>;
