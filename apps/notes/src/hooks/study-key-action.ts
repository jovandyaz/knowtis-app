import {
  RATING_ORDER,
  RATING_QUALITY,
  type RatingKey,
} from '@knowtis/design-system';
import type { SM2Quality } from '@knowtis/shared-types';

export const STUDY_KEY_ACTION_TYPES = {
  FLIP: 'flip',
  NAVIGATE: 'navigate',
  RATE: 'rate',
} as const;

export type StudyKeyAction =
  | { type: typeof STUDY_KEY_ACTION_TYPES.FLIP }
  | { type: typeof STUDY_KEY_ACTION_TYPES.NAVIGATE; direction: -1 | 1 }
  | { type: typeof STUDY_KEY_ACTION_TYPES.RATE; quality: SM2Quality };

const SIMPLE_MODE_RATING_KEYS: Record<string, RatingKey> = {
  '1': RATING_ORDER[0],
  '2': RATING_ORDER[2],
};

/** Space/Enter flip, arrows navigate; 1/2 rate wrong/correct in simple mode, 1-4 rate Again/Hard/Good/Easy in advanced mode. */
export function resolveStudyKeyAction(
  key: string,
  isAdvancedMode: boolean
): StudyKeyAction | undefined {
  if (key === ' ' || key === 'Enter') {
    return { type: STUDY_KEY_ACTION_TYPES.FLIP };
  }
  if (key === 'ArrowLeft') {
    return { type: STUDY_KEY_ACTION_TYPES.NAVIGATE, direction: -1 };
  }
  if (key === 'ArrowRight') {
    return { type: STUDY_KEY_ACTION_TYPES.NAVIGATE, direction: 1 };
  }
  const ratingKey = isAdvancedMode
    ? RATING_ORDER[Number(key) - 1]
    : SIMPLE_MODE_RATING_KEYS[key];
  return ratingKey
    ? { type: STUDY_KEY_ACTION_TYPES.RATE, quality: RATING_QUALITY[ratingKey] }
    : undefined;
}
