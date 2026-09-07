export const RATING_ORDER = ['again', 'hard', 'good', 'easy'] as const;
export type RatingKey = (typeof RATING_ORDER)[number];
