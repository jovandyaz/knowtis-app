import { detectPromptInjection, MAX_GUARD_INPUT_CHARS } from './prompt-guard';

export type AiInputSurface = 'history';

export const AI_INPUT_DISPOSITION = ['observe', 'block'] as const;

export type AiInputDisposition = (typeof AI_INPUT_DISPOSITION)[number];

export interface AiInputDetection {
  readonly safe: boolean;
  readonly score: number;
  readonly contentLength: number;
  readonly reasonCode: 'clear' | 'heuristic_hit' | 'too_large';
}

/** Bounded heuristic verdict with metadata suitable for logging. */
export function detectAiInput(text: string): AiInputDetection {
  const { safe, score } = detectPromptInjection(text);
  return {
    safe,
    score,
    contentLength: text.length,
    reasonCode:
      text.length > MAX_GUARD_INPUT_CHARS
        ? 'too_large'
        : safe
          ? 'clear'
          : 'heuristic_hit',
  };
}
