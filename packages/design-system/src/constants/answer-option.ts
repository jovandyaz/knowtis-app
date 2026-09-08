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

const LETTER_A_CHAR_CODE = 65;

/** The A-Z letter for a zero-based option position, 0-25. */
export function answerLetter(index: number): string {
  return String.fromCharCode(LETTER_A_CHAR_CODE + index);
}
