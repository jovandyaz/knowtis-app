import type { ProgressProps } from '@knowtis/design-system';

type ProgressTone = NonNullable<ProgressProps['tone']>;

const QUIZ_SCORE_THRESHOLD = {
  GOOD: 70,
  FAIR: 40,
} as const;

const SCORE_TONE = {
  GOOD: 'correct',
  FAIR: 'primary',
  POOR: 'incorrect',
} as const satisfies Record<string, ProgressTone>;

/** Progress tone for a finished quiz, from its percentage score. */
export function scoreTone(percentage: number): ProgressTone {
  if (percentage >= QUIZ_SCORE_THRESHOLD.GOOD) {
    return SCORE_TONE.GOOD;
  }
  if (percentage >= QUIZ_SCORE_THRESHOLD.FAIR) {
    return SCORE_TONE.FAIR;
  }
  return SCORE_TONE.POOR;
}
