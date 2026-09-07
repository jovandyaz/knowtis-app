import { detectPromptInjection } from './prompt-guard';

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
      text.length > 50_000 ? 'too_large' : safe ? 'clear' : 'heuristic_hit',
  };
}
