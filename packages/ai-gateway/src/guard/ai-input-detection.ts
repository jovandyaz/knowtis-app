import { detectPromptInjection, MAX_GUARD_INPUT_CHARS } from './prompt-guard';

export type AiInputSurface = 'history';

export const AI_INPUT_DISPOSITION = ['observe', 'block'] as const;

export type AiInputDisposition = (typeof AI_INPUT_DISPOSITION)[number];

const MAX_GUARD_PATTERN_SPAN_CHARS = 2_000;
const GUARD_WINDOW_STRIDE_CHARS =
  MAX_GUARD_INPUT_CHARS - MAX_GUARD_PATTERN_SPAN_CHARS;
const MAX_GUARD_SCAN_WINDOWS = 8;

/** Longest text `detectAiInput` will scan; past it the verdict is `too_large` and nothing is scored. */
export const MAX_GUARD_SCAN_CHARS =
  GUARD_WINDOW_STRIDE_CHARS * MAX_GUARD_SCAN_WINDOWS;

export interface AiInputDetection {
  readonly safe: boolean;
  readonly score: number;
  readonly contentLength: number;
  readonly reasonCode: 'clear' | 'heuristic_hit' | 'too_large';
}

/** Worst verdict across overlapping scan windows, with metadata suitable for logging; refuses text past `MAX_GUARD_SCAN_CHARS` unscanned. */
export function detectAiInput(text: string): AiInputDetection {
  if (text.length > MAX_GUARD_SCAN_CHARS) {
    return {
      safe: false,
      score: 1,
      contentLength: text.length,
      reasonCode: 'too_large',
    };
  }
  let safe = true;
  let score = 0;
  let start = 0;
  do {
    const window = detectPromptInjection(
      text.slice(start, start + MAX_GUARD_INPUT_CHARS)
    );
    safe = safe && window.safe;
    score = Math.max(score, window.score);
    start += GUARD_WINDOW_STRIDE_CHARS;
  } while (start < text.length);
  return {
    safe,
    score,
    contentLength: text.length,
    reasonCode: safe ? 'clear' : 'heuristic_hit',
  };
}
