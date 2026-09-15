import {
  useCallback,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';

import type {
  CardResult,
  CardSessionStatus,
  RestartFilter,
  SM2Quality,
  StudyCard,
  StudySessionResult,
} from '@knowtis/shared-types';
import { CARD_STATUS, SM2_QUALITY } from '@knowtis/shared-types';

const NO_ELAPSED_TIME = 0;
const NOT_FOUND = -1;

const SESSION_ACTION = {
  FLIP: 'FLIP',
  RATE: 'RATE',
  SKIP: 'SKIP',
  REVIEW_SKIPPED: 'REVIEW_SKIPPED',
  NAVIGATE: 'NAVIGATE',
  TOGGLE_ADVANCED: 'TOGGLE_ADVANCED',
  RESTART: 'RESTART',
  SHUFFLE: 'SHUFFLE',
} as const;

const RESTART_SUBSET_STATUS: Partial<Record<RestartFilter, CardSessionStatus>> =
  {
    missed: CARD_STATUS.WRONG,
    skipped: CARD_STATUS.SKIPPED,
  };

type RatedStatus = typeof CARD_STATUS.CORRECT | typeof CARD_STATUS.WRONG;
type CardRating = SM2Quality | null;

interface SessionState {
  currentIndex: number;
  flipped: boolean;
  cardStatuses: CardSessionStatus[];
  ratings: CardRating[];
  isAdvancedMode: boolean;
  isComplete: boolean;
  startTime: number;
  durationMs: number;
  originalCards: StudyCard[];
  activeCards: StudyCard[];
}

type SessionAction =
  | { type: typeof SESSION_ACTION.FLIP }
  | {
      type: typeof SESSION_ACTION.RATE;
      status: RatedStatus;
      quality: SM2Quality;
      cardIdentity: string;
    }
  | { type: typeof SESSION_ACTION.SKIP }
  | { type: typeof SESSION_ACTION.REVIEW_SKIPPED }
  | { type: typeof SESSION_ACTION.NAVIGATE; index: number }
  | { type: typeof SESSION_ACTION.TOGGLE_ADVANCED }
  | { type: typeof SESSION_ACTION.RESTART; filter: RestartFilter }
  | { type: typeof SESSION_ACTION.SHUFFLE; cards: StudyCard[] };

function fisherYatesShuffle<T>(items: T[]): T[] {
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function cardIdentityKey(card: StudyCard): string {
  return `${card.artifactId}:${card.cardIndex}`;
}

/** Index of the first pending card after `fromIndex`, wrapping around the deck; -1 when none is pending. */
export function findNextPendingIndex(
  statuses: CardSessionStatus[],
  fromIndex: number
): number {
  for (let offset = 1; offset <= statuses.length; offset++) {
    const index = (fromIndex + offset) % statuses.length;
    if (statuses[index] === CARD_STATUS.PENDING) {
      return index;
    }
  }
  return NOT_FOUND;
}

function checkComplete(statuses: CardSessionStatus[]): boolean {
  return statuses.every((s) => s !== CARD_STATUS.PENDING);
}

function durationOnComplete(state: SessionState): number {
  return state.isComplete ? state.durationMs : Date.now() - state.startTime;
}

function advanceAfterAction(
  state: SessionState,
  newStatuses: CardSessionStatus[]
): Pick<
  SessionState,
  'isComplete' | 'durationMs' | 'currentIndex' | 'flipped'
> {
  const complete = checkComplete(newStatuses);
  const nextIndex = findNextPendingIndex(newStatuses, state.currentIndex);
  return {
    flipped: false,
    isComplete: complete,
    durationMs: complete ? durationOnComplete(state) : NO_ELAPSED_TIME,
    currentIndex: complete
      ? state.currentIndex
      : nextIndex !== NOT_FOUND
        ? nextIndex
        : state.currentIndex,
  };
}

function freshSession(cards: StudyCard[]): Partial<SessionState> {
  return {
    currentIndex: 0,
    flipped: false,
    cardStatuses: Array(cards.length).fill(CARD_STATUS.PENDING),
    ratings: Array(cards.length).fill(null),
    isComplete: false,
    startTime: Date.now(),
    durationMs: NO_ELAPSED_TIME,
    activeCards: cards,
  };
}

function sessionReducer(
  state: SessionState,
  action: SessionAction
): SessionState {
  switch (action.type) {
    case SESSION_ACTION.FLIP:
      return { ...state, flipped: !state.flipped };

    case SESSION_ACTION.RATE: {
      const card = state.activeCards[state.currentIndex];
      if (!card || cardIdentityKey(card) !== action.cardIdentity) {
        return state;
      }
      const newStatuses = [...state.cardStatuses];
      newStatuses[state.currentIndex] = action.status;
      const newRatings = [...state.ratings];
      newRatings[state.currentIndex] = action.quality;
      return {
        ...state,
        cardStatuses: newStatuses,
        ratings: newRatings,
        ...advanceAfterAction(state, newStatuses),
      };
    }

    case SESSION_ACTION.SKIP: {
      const newStatuses = [...state.cardStatuses];
      newStatuses[state.currentIndex] = CARD_STATUS.SKIPPED;
      return {
        ...state,
        cardStatuses: newStatuses,
        ...advanceAfterAction(state, newStatuses),
      };
    }

    case SESSION_ACTION.REVIEW_SKIPPED: {
      if (state.cardStatuses[state.currentIndex] !== CARD_STATUS.SKIPPED) {
        return state;
      }
      const cardStatuses = [...state.cardStatuses];
      const ratings = [...state.ratings];
      cardStatuses[state.currentIndex] = CARD_STATUS.PENDING;
      ratings[state.currentIndex] = null;
      return {
        ...state,
        cardStatuses,
        ratings,
        isComplete: false,
        durationMs: NO_ELAPSED_TIME,
      };
    }

    case SESSION_ACTION.NAVIGATE:
      return { ...state, currentIndex: action.index, flipped: false };

    case SESSION_ACTION.TOGGLE_ADVANCED:
      return { ...state, isAdvancedMode: !state.isAdvancedMode };

    case SESSION_ACTION.SHUFFLE: {
      const byIdentity = new Map(
        state.activeCards.map((card, i) => [
          cardIdentityKey(card),
          { status: state.cardStatuses[i], rating: state.ratings[i] },
        ])
      );
      const remapped = action.cards.map((card) =>
        byIdentity.get(cardIdentityKey(card))
      );
      return {
        ...state,
        currentIndex: 0,
        flipped: false,
        cardStatuses: remapped.map(
          (entry) => entry?.status ?? CARD_STATUS.PENDING
        ),
        ratings: remapped.map((entry) => entry?.rating ?? null),
        isComplete: false,
        durationMs: NO_ELAPSED_TIME,
        activeCards: action.cards,
      };
    }

    case SESSION_ACTION.RESTART: {
      const subsetStatus = RESTART_SUBSET_STATUS[action.filter];
      const subset = subsetStatus
        ? state.activeCards.filter(
            (_, i) => state.cardStatuses[i] === subsetStatus
          )
        : [];
      const cards = subset.length > 0 ? subset : state.originalCards;
      return { ...state, ...freshSession(cards) };
    }

    default:
      return state;
  }
}

function createInitialState(cards: StudyCard[]): SessionState {
  return {
    currentIndex: 0,
    flipped: false,
    cardStatuses: Array(cards.length).fill(CARD_STATUS.PENDING),
    ratings: Array(cards.length).fill(null),
    isAdvancedMode: false,
    isComplete: false,
    startTime: Date.now(),
    durationMs: NO_ELAPSED_TIME,
    originalCards: cards,
    activeCards: cards,
  };
}

export function useFlashcardSession(
  cards: StudyCard[],
  shuffleFn: <T>(items: T[]) => T[] = fisherYatesShuffle
) {
  const [state, dispatch] = useReducer(
    sessionReducer,
    cards,
    createInitialState
  );

  const counts = useMemo(() => {
    const correct = state.cardStatuses.filter(
      (s) => s === CARD_STATUS.CORRECT
    ).length;
    const wrong = state.cardStatuses.filter(
      (s) => s === CARD_STATUS.WRONG
    ).length;
    const skipped = state.cardStatuses.filter(
      (s) => s === CARD_STATUS.SKIPPED
    ).length;
    return { correct, wrong, skipped };
  }, [state.cardStatuses]);

  const currentCard = state.activeCards[state.currentIndex];
  const currentCardIdentity = currentCard ? cardIdentityKey(currentCard) : '';
  const currentCardIdentityRef = useRef(currentCardIdentity);
  useLayoutEffect(() => {
    currentCardIdentityRef.current = currentCardIdentity;
  }, [currentCardIdentity]);

  const flip = useCallback(() => dispatch({ type: SESSION_ACTION.FLIP }), []);

  const rateAdvanced = useCallback(
    (quality: SM2Quality, cardIdentity = currentCardIdentity): boolean => {
      // A saved review can retain this callback from before a shuffle or navigation.
      if (!cardIdentity || cardIdentity !== currentCardIdentityRef.current) {
        return false;
      }
      const status: RatedStatus =
        quality >= SM2_QUALITY.GOOD ? CARD_STATUS.CORRECT : CARD_STATUS.WRONG;
      dispatch({ type: SESSION_ACTION.RATE, status, quality, cardIdentity });
      return true;
    },
    [currentCardIdentity]
  );

  const rate = useCallback(
    (status: RatedStatus, cardIdentity?: string): boolean =>
      rateAdvanced(
        status === CARD_STATUS.CORRECT ? SM2_QUALITY.GOOD : SM2_QUALITY.AGAIN,
        cardIdentity
      ),
    [rateAdvanced]
  );

  const skip = useCallback(() => {
    dispatch({ type: SESSION_ACTION.SKIP });
  }, []);
  const reviewSkipped = useCallback(() => {
    dispatch({ type: SESSION_ACTION.REVIEW_SKIPPED });
  }, []);

  const navigate = useCallback((index: number) => {
    dispatch({ type: SESSION_ACTION.NAVIGATE, index });
  }, []);

  const toggleAdvanced = useCallback(
    () => dispatch({ type: SESSION_ACTION.TOGGLE_ADVANCED }),
    []
  );

  const restart = useCallback((filter: RestartFilter = 'all') => {
    dispatch({ type: SESSION_ACTION.RESTART, filter });
  }, []);

  const shuffle = useCallback(() => {
    dispatch({
      type: SESSION_ACTION.SHUFFLE,
      cards: shuffleFn(state.activeCards),
    });
  }, [shuffleFn, state.activeCards]);

  const sessionResult = useMemo((): StudySessionResult => {
    const cardResults: CardResult[] = state.activeCards.map((card, i) => ({
      artifactId: card.artifactId,
      cardIndex: card.cardIndex,
      status: state.cardStatuses[i] ?? CARD_STATUS.PENDING,
      front: card.front,
      back: card.back,
    }));
    return {
      correct: counts.correct,
      wrong: counts.wrong,
      skipped: counts.skipped,
      total: state.activeCards.length,
      durationMs: state.durationMs,
      cardResults,
    };
  }, [counts, state.durationMs, state.cardStatuses, state.activeCards]);

  return {
    currentIndex: state.currentIndex,
    flipped: state.flipped,
    isAdvancedMode: state.isAdvancedMode,
    isComplete: state.isComplete,
    currentCard,
    totalCards: state.activeCards.length,
    cardStatuses: state.cardStatuses,
    ratings: state.ratings,
    counts,
    sessionResult,

    flip,
    rate,
    rateAdvanced,
    skip,
    reviewSkipped,
    navigate,
    toggleAdvanced,
    restart,
    shuffle,
  };
}
