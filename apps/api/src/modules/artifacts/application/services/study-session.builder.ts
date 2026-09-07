import {
  STUDY_CARD_KIND,
  type StudyCard,
  type StudyStats,
} from '@knowtis/shared-types';

import type {
  DueCardRow,
  FlashcardDeckRow,
  StudyActivity,
} from '../../domain/ports/artifact.repository';
import { hashSeed, seededShuffle } from './seeded-shuffle';
import {
  initializeProgress,
  predictIntervals,
} from './spaced-repetition.service';
import { computeStreak } from './study-streak';

export interface NewCardRef {
  deck: FlashcardDeckRow;
  cardIndex: number;
}

export interface BuildStudyCardsInput {
  due: DueCardRow[];
  decks: FlashcardDeckRow[];
  seed: string;
  dueLimit: number;
  newLimit: number;
}

const NEW_BLOCK_SEED_SUFFIX = ':new';

export function pickNewCardRefs(
  decks: readonly FlashcardDeckRow[],
  limit: number
): NewCardRef[] {
  const queues = decks.map((deck) => {
    const seen = new Set(deck.seenIndexes);
    return {
      deck,
      indexes: deck.cards.map((_, index) => index).filter((i) => !seen.has(i)),
    };
  });

  const picked: NewCardRef[] = [];
  let position = 0;
  while (picked.length < limit && queues.some((q) => q.indexes.length > 0)) {
    const queue = queues[position % queues.length];
    const cardIndex = queue?.indexes.shift();
    if (queue && cardIndex !== undefined) {
      picked.push({ deck: queue.deck, cardIndex });
    }
    position++;
  }
  return picked;
}

function dueToStudyCard(row: DueCardRow): StudyCard {
  return {
    artifactId: row.artifactId,
    cardIndex: row.cardIndex,
    noteId: row.noteId,
    deckTitle: row.deckTitle,
    bucket: row.bucket,
    front: row.front,
    back: row.back,
    difficulty: row.difficulty,
    kind: STUDY_CARD_KIND.DUE,
    predictedIntervals: predictIntervals({
      repetitions: row.repetitions,
      easeFactor: row.easeFactor,
      intervalDays: row.intervalDays,
    }),
  };
}

function newToStudyCard(ref: NewCardRef): StudyCard | null {
  const card = ref.deck.cards[ref.cardIndex];
  if (!card) {
    return null;
  }
  return {
    artifactId: ref.deck.artifactId,
    cardIndex: ref.cardIndex,
    noteId: ref.deck.noteId,
    deckTitle: ref.deck.deckTitle,
    bucket: ref.deck.bucket,
    front: card.front,
    back: card.back,
    difficulty: card.difficulty,
    kind: STUDY_CARD_KIND.NEW,
    predictedIntervals: predictIntervals(initializeProgress()),
  };
}

export function buildStudyCards(input: BuildStudyCardsInput): StudyCard[] {
  const dueBlock = seededShuffle(
    input.due.slice(0, input.dueLimit).map(dueToStudyCard),
    hashSeed(input.seed)
  );
  const newBlock = seededShuffle(
    pickNewCardRefs(input.decks, input.newLimit)
      .map(newToStudyCard)
      .filter((card): card is StudyCard => card !== null),
    hashSeed(`${input.seed}${NEW_BLOCK_SEED_SUFFIX}`)
  );
  return [...dueBlock, ...newBlock];
}

export function toStudyStats(
  activity: StudyActivity,
  today: string
): StudyStats {
  return {
    dueCount: activity.dueCount,
    newCount: activity.newCount,
    reviewedToday:
      activity.activeDays.find((entry) => entry.day === today)?.reviews ?? 0,
    currentStreak: computeStreak(
      activity.activeDays.map((entry) => entry.day),
      today
    ),
    totalCardsStudied: activity.totalCardsStudied,
    nextDueAt: activity.nextDueAt ? activity.nextDueAt.toISOString() : null,
  };
}
