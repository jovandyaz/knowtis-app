import {
  FLASHCARD_REVIEW_KIND,
  type FlashcardProgress,
  type FlashcardReviewKind,
} from '@knowtis/shared-types';

/**
 * Classifies a review against the card's schedule: a card without progress is
 * new, one whose next review has already come round is due, anything else is
 * being reviewed early.
 */
export function classifyReviewKind(
  progress: FlashcardProgress | null,
  now: Date
): FlashcardReviewKind {
  if (!progress) {
    return FLASHCARD_REVIEW_KIND.NEW;
  }

  return new Date(progress.nextReview) <= now
    ? FLASHCARD_REVIEW_KIND.DUE
    : FLASHCARD_REVIEW_KIND.EARLY;
}
