import {
  matchInjectionPatterns,
  MAX_GUARD_INPUT_CHARS,
  MAX_INJECTION_PATTERN_SPAN_CHARS,
  normalizeForGuard,
  scoreInjectionHits,
  type InjectionPatternHit,
} from './prompt-guard';

export type AiInputSurface = 'history';

export const AI_INPUT_DISPOSITION = ['observe', 'block'] as const;

export type AiInputDisposition = (typeof AI_INPUT_DISPOSITION)[number];

const GUARD_WINDOW_OVERLAP_CHARS = MAX_INJECTION_PATTERN_SPAN_CHARS;
const GUARD_WINDOW_STRIDE_CHARS =
  MAX_GUARD_INPUT_CHARS - GUARD_WINDOW_OVERLAP_CHARS;
const MAX_GUARD_SCAN_WINDOWS = 8;
// A cut run of base64 characters would otherwise satisfy the lookarounds that
// bound the weak base64 signal, because they succeed vacuously at a slice edge.
const WINDOW_CUT_SENTINEL = '=';

/** Longest text `detectAiInput` will scan; past it the verdict is `too_large` and nothing is scored. */
export const MAX_GUARD_SCAN_CHARS =
  GUARD_WINDOW_STRIDE_CHARS * MAX_GUARD_SCAN_WINDOWS;

export interface AiInputDetection {
  readonly safe: boolean;
  readonly score: number;
  readonly contentLength: number;
  readonly reasonCode: 'clear' | 'heuristic_hit' | 'too_large';
}

function collapseForGuard(text: string): string {
  return normalizeForGuard(text).replaceAll(/\s+/g, ' ');
}

/** Cumulative verdict over the whole text, scanned in overlapping windows; refuses text past `MAX_GUARD_SCAN_CHARS` unscanned. */
export function detectAiInput(text: string): AiInputDetection {
  if (text.length > MAX_GUARD_SCAN_CHARS) {
    return {
      safe: false,
      score: 1,
      contentLength: text.length,
      reasonCode: 'too_large',
    };
  }
  const scanned = collapseForGuard(text);
  const hits = new Map<number, InjectionPatternHit>();
  let start = 0;
  do {
    const end = start + MAX_GUARD_INPUT_CHARS;
    const window = `${start > 0 ? WINDOW_CUT_SENTINEL : ''}${scanned.slice(
      start,
      end
    )}${end < scanned.length ? WINDOW_CUT_SENTINEL : ''}`;
    for (const hit of matchInjectionPatterns(window)) {
      hits.set(hit.id, hit);
    }
    start += GUARD_WINDOW_STRIDE_CHARS;
  } while (start < scanned.length);
  const { safe, score } = scoreInjectionHits([...hits.values()]);
  return {
    safe,
    score,
    contentLength: text.length,
    reasonCode: safe ? 'clear' : 'heuristic_hit',
  };
}
