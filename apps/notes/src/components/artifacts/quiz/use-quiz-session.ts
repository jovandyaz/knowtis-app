import { useCallback, useReducer } from 'react';

import {
  QUIZ_ATTEMPT_SCOPE,
  type QuizAttemptScope,
  type QuizContent,
} from '@knowtis/shared-types';

export interface QuizAnswerRecord {
  questionIndex: number;
  selectedIndex: number;
  correct: boolean;
}

interface SessionState {
  questions: QuizContent['questions'];
  scope: QuizAttemptScope;
  activeIndexes: number[];
  position: number;
  selectedOption: number | null;
  checked: boolean;
  answers: QuizAnswerRecord[];
  completed: boolean;
}

type SessionAction =
  | { type: 'SELECT'; option: number }
  | { type: 'CHECK' }
  | { type: 'NEXT' }
  | { type: 'RESTART' }
  | { type: 'RETRY_MISSED' };

function createInitialState(questions: QuizContent['questions']): SessionState {
  return {
    questions,
    scope: QUIZ_ATTEMPT_SCOPE.FULL,
    activeIndexes: questions.map((_, index) => index),
    position: 0,
    selectedOption: null,
    checked: false,
    answers: [],
    completed: false,
  };
}

function sessionReducer(
  state: SessionState,
  action: SessionAction
): SessionState {
  const questionIndex = state.activeIndexes[state.position];
  const question = state.questions[questionIndex];

  switch (action.type) {
    case 'SELECT':
      if (
        state.checked ||
        state.completed ||
        !question ||
        !Number.isInteger(action.option) ||
        action.option < 0 ||
        action.option >= question.options.length
      ) {
        return state;
      }
      return { ...state, selectedOption: action.option };

    case 'CHECK':
      if (
        state.checked ||
        state.completed ||
        state.selectedOption === null ||
        !question
      ) {
        return state;
      }
      return {
        ...state,
        checked: true,
        answers: [
          ...state.answers,
          {
            questionIndex,
            selectedIndex: state.selectedOption,
            correct: state.selectedOption === question.correctIndex,
          },
        ],
      };

    case 'NEXT':
      if (!state.checked || state.completed) {
        return state;
      }
      return state.position === state.activeIndexes.length - 1
        ? { ...state, completed: true }
        : {
            ...state,
            position: state.position + 1,
            selectedOption: null,
            checked: false,
          };

    case 'RESTART':
      return createInitialState(state.questions);

    case 'RETRY_MISSED': {
      const missedIndexes = state.answers
        .filter((answer) => !answer.correct)
        .map((answer) => answer.questionIndex);
      if (!state.completed || missedIndexes.length === 0) {
        return state;
      }
      return {
        ...createInitialState(state.questions),
        scope: QUIZ_ATTEMPT_SCOPE.MISSED,
        activeIndexes: missedIndexes,
      };
    }

    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled quiz action: ${exhaustive}`);
    }
  }
}

/** Editable selection, checked feedback and original question indexes for each run. */
export function useQuizSession(questions: QuizContent['questions']) {
  const [state, dispatch] = useReducer(
    sessionReducer,
    questions,
    createInitialState
  );
  const select = useCallback(
    (option: number) => dispatch({ type: 'SELECT', option }),
    []
  );
  const check = useCallback(() => dispatch({ type: 'CHECK' }), []);
  const next = useCallback(() => dispatch({ type: 'NEXT' }), []);
  const restart = useCallback(() => dispatch({ type: 'RESTART' }), []);
  const retryMissed = useCallback(() => dispatch({ type: 'RETRY_MISSED' }), []);
  const currentQuestionIndex = state.activeIndexes[state.position];
  const questionStatuses: ReadonlyArray<
    'correct' | 'incorrect' | 'unanswered'
  > = state.activeIndexes.map((questionIndex) => {
    const answer = state.answers.find(
      (item) => item.questionIndex === questionIndex
    );
    return answer ? (answer.correct ? 'correct' : 'incorrect') : 'unanswered';
  });

  return {
    scope: state.scope,
    activeIndexes: state.activeIndexes,
    position: state.position,
    currentQuestionIndex,
    currentQuestion: state.questions[currentQuestionIndex],
    selectedOption: state.selectedOption,
    checked: state.checked,
    answers: state.answers,
    questionStatuses,
    completed: state.completed,
    score: state.answers.filter((answer) => answer.correct).length,
    total: state.activeIndexes.length,
    missedIndexes: state.answers
      .filter((answer) => !answer.correct)
      .map((answer) => answer.questionIndex),
    isLast: state.position === state.activeIndexes.length - 1,
    select,
    check,
    next,
    restart,
    retryMissed,
  };
}
