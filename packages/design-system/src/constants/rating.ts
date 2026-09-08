import type { PredictedIntervals } from '@knowtis/shared-types';

export const RATING_ORDER = [
  'again',
  'hard',
  'good',
  'easy',
] as const satisfies readonly (keyof PredictedIntervals)[];
export type RatingKey = (typeof RATING_ORDER)[number];
