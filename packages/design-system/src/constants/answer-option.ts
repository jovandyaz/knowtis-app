export const ANSWER_OPTION_STATES = [
  'idle',
  'selected',
  'correct',
  'incorrect',
] as const;

export type AnswerOptionState = (typeof ANSWER_OPTION_STATES)[number];

export const ANSWER_OUTCOMES = [
  'correct',
  'incorrect',
] as const satisfies readonly AnswerOptionState[];

export type AnswerOutcome = (typeof ANSWER_OUTCOMES)[number];
