import {
  STUDY_CARD_KIND,
  type FlashcardArtifact,
  type FlashcardProgress,
  type PredictedIntervals,
  type StudyCard,
} from '@knowtis/shared-types';

/** Neutral placeholder until the server sends per-card predicted intervals for a single deck. */
const NEUTRAL_PREDICTED_INTERVALS: PredictedIntervals = {
  again: 1,
  hard: 1,
  good: 1,
  easy: 1,
};

/**
 * Gives a deck's cards their identity from the artifact and its saved progress.
 * `kind` is `'due'` when a progress row exists for the card, `'new'` otherwise —
 * it does not read `nextReview`; the server, not the client, decides what's due.
 */
export function deckStudyCards(
  artifact: FlashcardArtifact,
  progress: FlashcardProgress[] | undefined
): StudyCard[] {
  const dueCardIndexes = new Set((progress ?? []).map((p) => p.cardIndex));

  return artifact.content.cards.map((card, cardIndex) => ({
    artifactId: artifact.id,
    cardIndex,
    noteId: artifact.sourceNoteId,
    deckTitle: artifact.title,
    bucket: null,
    front: card.front,
    back: card.back,
    difficulty: card.difficulty,
    kind: dueCardIndexes.has(cardIndex)
      ? STUDY_CARD_KIND.DUE
      : STUDY_CARD_KIND.NEW,
    predictedIntervals: NEUTRAL_PREDICTED_INTERVALS,
  }));
}
