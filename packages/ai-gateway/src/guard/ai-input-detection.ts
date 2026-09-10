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

/** Longest text `detectAiInput` will scan, measured before and after normalization; past it the verdict is `too_large` and nothing is scored. */
export const MAX_GUARD_SCAN_CHARS =
  GUARD_WINDOW_STRIDE_CHARS * MAX_GUARD_SCAN_WINDOWS;

export interface AiInputDetection {
  readonly safe: boolean;
  readonly score: number;
  readonly contentLength: number;
  readonly reasonCode: 'clear' | 'heuristic_hit' | 'too_large';
}

function refused(contentLength: number): AiInputDetection {
  return { safe: false, score: 1, contentLength, reasonCode: 'too_large' };
}

/** Cumulative verdict over the whole text: run-anchored patterns scan it entire, the rest scan overlapping windows. Text past `MAX_GUARD_SCAN_CHARS` is refused unscanned, and the score is at least what a single unbounded scan would give. */
export function detectAiInput(text: string): AiInputDetection {
  if (text.length > MAX_GUARD_SCAN_CHARS) {
    return refused(text.length);
  }
  const normalized = normalizeForGuard(text);
  if (normalized.length > MAX_GUARD_SCAN_CHARS) {
    return refused(text.length);
  }
  const scanned = normalized.replaceAll(/\s+/g, ' ');
  const hits = new Map<number, InjectionPatternHit>();
  for (const hit of matchInjectionPatterns(scanned, 'run-anchored')) {
    hits.set(hit.id, hit);
  }
  let start = 0;
  do {
    for (const hit of matchInjectionPatterns(
      scanned.slice(start, start + MAX_GUARD_INPUT_CHARS),
      'windowed'
    )) {
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
