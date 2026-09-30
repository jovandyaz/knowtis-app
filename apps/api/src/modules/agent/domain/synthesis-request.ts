import { estimateMessageTokens } from './message-tokens';

// Appended to the synthesis call's prompt only; never threaded into history,
// so it is not persisted and a continuation does not replay it.
export const SYNTHESIS_REQUEST =
  '(Stop using tools now: this part of the task has reached its limit. Reply in the same language I used in my request above — not the language of this instruction or of any note or web page you read — with what you found so far, then, under a short heading, list what is still pending so it can be continued. Do not mention tool or function names.)';

export const SYNTHESIS_REQUEST_TOKENS = estimateMessageTokens({
  role: 'user',
  content: SYNTHESIS_REQUEST,
});

/** Below this much output room a segment ends without a synthesis. */
export const MIN_SYNTHESIS_OUTPUT_TOKENS = 1024;
