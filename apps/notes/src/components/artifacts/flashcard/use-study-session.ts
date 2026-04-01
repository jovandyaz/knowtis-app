import { useCallback, useMemo, useReducer } from 'react';

import type {
  CardResult,
  CardSessionStatus,
  FlashcardContent,
  RestartFilter,
  SM2Quality,
  StudySessionResult,
} from '@knowtis/shared-types';
import { CARD_STATUS, SM2_QUALITY } from '@knowtis/shared-types';

type FlashcardCard = FlashcardContent['cards'][number];

interface SessionState {
  currentIndex: number;
  flipped: boolean;
  cardStatuses: CardSessionStatus[];
  isAdvancedMode: boolean;
  isComplete: boolean;
  startTime: number;
  endTime: number | null;
  originalCards: FlashcardCard[];
  activeCards: FlashcardCard[];
}

type SessionAction =
  | { type: 'FLIP' }
  | { type: 'RATE'; status: 'correct' | 'wrong' }
  | { type: 'SKIP' }
  | { type: 'NAVIGATE'; index: number }
  | { type: 'TOGGLE_ADVANCED' }
  | { type: 'RESTART'; filter: RestartFilter }
  | { type: 'FINISH' };

function findNextPendingIndex(
  statuses: CardSessionStatus[],
  fromIndex: number
): number {
  for (let i = fromIndex + 1; i < statuses.length; i++) {
    if (statuses[i] === CARD_STATUS.PENDING) {
      return i;
    }
  }
  return -1;
}

function checkComplete(statuses: CardSessionStatus[]): boolean {
  return statuses.every((s) => s !== CARD_STATUS.PENDING);
}

function advanceAfterAction(
  state: SessionState,
  newStatuses: CardSessionStatus[]
): Pick<SessionState, 'isComplete' | 'endTime' | 'currentIndex' | 'flipped'> {
  const complete = checkComplete(newStatuses);
  const nextIndex = findNextPendingIndex(newStatuses, state.currentIndex);
  return {
    flipped: false,
    isComplete: complete,
    endTime: complete ? Date.now() : null,
    currentIndex: complete
      ? state.currentIndex
      : nextIndex !== -1
        ? nextIndex
        : state.currentIndex,
  };
}

function sessionReducer(
  state: SessionState,
  action: SessionAction
): SessionState {
  switch (action.type) {
    case 'FLIP':
      return { ...state, flipped: !state.flipped };

    case 'RATE': {
      const newStatuses = [...state.cardStatuses];
      newStatuses[state.currentIndex] = action.status;
      return {
        ...state,
        cardStatuses: newStatuses,
        ...advanceAfterAction(state, newStatuses),
      };
    }

    case 'SKIP': {
      const newStatuses = [...state.cardStatuses];
      newStatuses[state.currentIndex] = CARD_STATUS.SKIPPED;
      return {
        ...state,
        cardStatuses: newStatuses,
        ...advanceAfterAction(state, newStatuses),
      };
    }

    case 'NAVIGATE':
      return { ...state, currentIndex: action.index, flipped: false };

    case 'FINISH': {
      const finishedStatuses = state.cardStatuses.map((s) =>
        s === CARD_STATUS.PENDING ? CARD_STATUS.SKIPPED : s
      ) as CardSessionStatus[];
      return {
        ...state,
        cardStatuses: finishedStatuses,
        isComplete: true,
        endTime: Date.now(),
        flipped: false,
      };
    }

    case 'TOGGLE_ADVANCED':
      return { ...state, isAdvancedMode: !state.isAdvancedMode };

    case 'RESTART': {
      if (action.filter === 'missed' || action.filter === 'skipped') {
        const targetStatus =
          action.filter === 'missed' ? CARD_STATUS.WRONG : CARD_STATUS.SKIPPED;
        const filteredCards = state.originalCards.filter(
          (_, i) => state.cardStatuses[i] === targetStatus
        );
        if (filteredCards.length > 0) {
          return {
            ...state,
            currentIndex: 0,
            flipped: false,
            cardStatuses: Array(filteredCards.length).fill(CARD_STATUS.PENDING),
            isComplete: false,
            startTime: Date.now(),
            endTime: null,
            activeCards: filteredCards,
          };
        }
      }
      return {
        ...state,
        currentIndex: 0,
        flipped: false,
        cardStatuses: Array(state.originalCards.length).fill(
          CARD_STATUS.PENDING
        ),
        isComplete: false,
        startTime: Date.now(),
        endTime: null,
        activeCards: state.originalCards,
      };
    }

    default:
      return state;
  }
}

function createInitialState(cards: FlashcardCard[]): SessionState {
  return {
    currentIndex: 0,
    flipped: false,
    cardStatuses: Array(cards.length).fill(CARD_STATUS.PENDING),
    isAdvancedMode: false,
    isComplete: false,
    startTime: Date.now(),
    endTime: null,
    originalCards: cards,
    activeCards: cards,
  };
}

export function useStudySession(content: FlashcardContent) {
  const [state, dispatch] = useReducer(
    sessionReducer,
    content.cards,
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

  const flip = useCallback(() => dispatch({ type: 'FLIP' }), []);

  const rate = useCallback((status: 'correct' | 'wrong') => {
    dispatch({ type: 'RATE', status });
  }, []);

  const rateAdvanced = useCallback((quality: SM2Quality) => {
    const status: 'correct' | 'wrong' =
      quality >= SM2_QUALITY.GOOD ? CARD_STATUS.CORRECT : CARD_STATUS.WRONG;
    dispatch({ type: 'RATE', status });
  }, []);

  const skip = useCallback(() => {
    dispatch({ type: 'SKIP' });
  }, []);

  const navigate = useCallback((index: number) => {
    dispatch({ type: 'NAVIGATE', index });
  }, []);

  const toggleAdvanced = useCallback(
    () => dispatch({ type: 'TOGGLE_ADVANCED' }),
    []
  );

  const finish = useCallback(() => {
    dispatch({ type: 'FINISH' });
  }, []);

  const restart = useCallback((filter: RestartFilter = 'all') => {
    dispatch({ type: 'RESTART', filter });
  }, []);

  const sessionResult = useMemo((): StudySessionResult => {
    const durationMs = (state.endTime ?? state.startTime) - state.startTime;
    const cardResults: CardResult[] = state.activeCards.map((card, i) => ({
      cardIndex: i,
      status: state.cardStatuses[i] ?? CARD_STATUS.PENDING,
      front: card.front,
      back: card.back,
    }));
    return {
      correct: counts.correct,
      wrong: counts.wrong,
      skipped: counts.skipped,
      total: state.activeCards.length,
      durationMs,
      cardResults,
    };
  }, [
    counts,
    state.startTime,
    state.endTime,
    state.cardStatuses,
    state.activeCards,
  ]);

  return {
    currentIndex: state.currentIndex,
    flipped: state.flipped,
    isAdvancedMode: state.isAdvancedMode,
    isComplete: state.isComplete,
    currentCard,
    totalCards: state.activeCards.length,
    cardStatuses: state.cardStatuses,
    counts,
    sessionResult,

    flip,
    rate,
    rateAdvanced,
    skip,
    finish,
    navigate,
    toggleAdvanced,
    restart,
  };
}
