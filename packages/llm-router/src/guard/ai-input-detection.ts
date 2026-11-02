import {
  locateInjectionPatterns,
  matchInjectionPatterns,
  MAX_GUARD_INPUT_CHARS,
  MAX_INJECTION_PATTERN_SPAN_CHARS,
  normalizeForGuard,
  scoreInjectionHits,
  type InjectionPatternHit,
  type InjectionSpan,
} from './prompt-guard';

export type AiInputSurface = 'history';

export const AI_INPUT_DISPOSITION = ['block', 'withhold', 'redact'] as const;

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

const WHITESPACE = /\s/;
const WHITESPACE_RUN = /\s+/g;
const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

function scannedTextOf(text: string): string | null {
  if (text.length > MAX_GUARD_SCAN_CHARS) {
    return null;
  }
  const normalized = normalizeForGuard(text);
  return normalized.length > MAX_GUARD_SCAN_CHARS
    ? null
    : normalized.replaceAll(WHITESPACE_RUN, ' ');
}

function forEachScanWindow(
  scanned: string,
  visit: (window: string, offset: number) => void
): void {
  let start = 0;
  do {
    visit(scanned.slice(start, start + MAX_GUARD_INPUT_CHARS), start);
    start += GUARD_WINDOW_STRIDE_CHARS;
  } while (start < scanned.length);
}

interface OriginMap {
  readonly scanned: string;
  readonly starts: readonly number[];
  readonly ends: readonly number[];
}

// NFKC can compose across grapheme boundaries, so a map built one grapheme at
// a time is only trusted when it reproduces the detector's scanned text.
function mapScannedToOrigin(text: string): OriginMap {
  let scanned = '';
  let inWhitespace = false;
  const starts: number[] = [];
  const ends: number[] = [];
  for (const { segment, index } of GRAPHEMES.segment(text)) {
    const end = index + segment.length;
    const piece = normalizeForGuard(segment);
    for (let unit = 0; unit < piece.length; unit += 1) {
      const char = piece.charAt(unit);
      const whitespace = WHITESPACE.test(char);
      if (whitespace && inWhitespace) {
        ends[ends.length - 1] = end;
      } else {
        scanned += whitespace ? ' ' : char;
        starts.push(index);
        ends.push(end);
      }
      inWhitespace = whitespace;
    }
  }
  return { scanned, starts, ends };
}

/** Cumulative verdict over the whole text: run-anchored patterns scan it entire, the rest scan overlapping windows. Text past `MAX_GUARD_SCAN_CHARS` is refused unscanned, and the score is at least what a single unbounded scan would give. */
export function detectAiInput(text: string): AiInputDetection {
  const scanned = scannedTextOf(text);
  if (scanned === null) {
    return refused(text.length);
  }
  const hits = new Map<number, InjectionPatternHit>();
  for (const hit of matchInjectionPatterns(scanned, 'run-anchored')) {
    hits.set(hit.id, hit);
  }
  forEachScanWindow(scanned, (window) => {
    for (const hit of matchInjectionPatterns(window, 'windowed')) {
      hits.set(hit.id, hit);
    }
  });
  const { safe, score } = scoreInjectionHits([...hits.values()]);
  return {
    safe,
    score,
    contentLength: text.length,
    reasonCode: safe ? 'clear' : 'heuristic_hit',
  };
}

/** Where `text` matches the patterns `detectAiInput` scores, over the same normalized, whitespace-collapsed windows, as sorted, distinct offsets into `text` itself. Null when `detectAiInput` would refuse the text as `too_large`, or when its normalization cannot be traced back to source offsets: the caller must then treat the whole text as one hit. */
export function locateInjectionSpans(
  text: string
): readonly InjectionSpan[] | null {
  const scanned = scannedTextOf(text);
  if (scanned === null) {
    return null;
  }
  const origin = mapScannedToOrigin(text);
  if (origin.scanned !== scanned) {
    return null;
  }
  const found = locateInjectionPatterns(scanned, 'run-anchored');
  forEachScanWindow(scanned, (window, offset) => {
    for (const { start, end } of locateInjectionPatterns(window, 'windowed')) {
      found.push({ start: start + offset, end: end + offset });
    }
  });
  const distinct = new Map<string, InjectionSpan>();
  for (const { start, end } of found) {
    const span = { start: origin.starts[start], end: origin.ends[end - 1] };
    distinct.set(`${span.start}:${span.end}`, span);
  }
  return [...distinct.values()].sort(
    (a, b) => a.start - b.start || a.end - b.end
  );
}
