import {
  detectAiInput,
  locateInjectionSpans,
  type InjectionSpan,
} from '@jovandyaz/llm-router';
import { Injectable } from '@nestjs/common';

import { htmlToPlainText } from '../../../agent/infrastructure/sanitize/html-sanitizer';
import {
  CLASSIFIER_INPUT_MAX_CHARS,
  InjectionClassifierService,
} from '../../../ai/application/services/injection-classifier.service';
import type { AiExecutionContext } from '../../../ai/domain/execution-context/ai-execution-context';

/** Context the classifier gets on each side of a hit, so it can tell a note that discusses an attack from one that carries it. */
const EXCERPT_CONTEXT_CHARS = 600;
const EXCERPT_CORE_MAX_CHARS =
  CLASSIFIER_INPUT_MAX_CHARS - 2 * EXCERPT_CONTEXT_CHARS;
/** Past this many excerpts a note is refused unjudged: an attacker could otherwise bury one hit among benign ones. */
export const MAX_CLASSIFIED_EXCERPTS = 8;

export type NoteContentBlockReason =
  | 'classifier'
  | 'classifier_degraded'
  | 'too_many_hits'
  | 'unlocated_hit';

export type NoteContentVerdict =
  | { safe: true; score: number; classified: number }
  | { safe: false; score: number; reason: NoteContentBlockReason };

interface Excerpt {
  text: string;
  score: number;
}

/** `spans` is null when the heuristic fails the text but cannot say where. */
interface Hits {
  score: number;
  spans: readonly InjectionSpan[] | null;
}

/**
 * Screens a note before an artifact is generated from it. The heuristic cannot tell an attack
 * from a note that discusses one, so the classifier must clear every hit, read in its context.
 */
@Injectable()
export class NoteContentGuard {
  constructor(private readonly classifier: InjectionClassifierService) {}

  async screen(
    html: string,
    execution: AiExecutionContext
  ): Promise<NoteContentVerdict> {
    const excerpts = excerptsOf(html);
    if (!Array.isArray(excerpts)) {
      return { safe: false, score: excerpts.score, reason: 'unlocated_hit' };
    }
    const score = Math.max(0, ...excerpts.map((excerpt) => excerpt.score));
    if (excerpts.length > MAX_CLASSIFIED_EXCERPTS) {
      return { safe: false, score, reason: 'too_many_hits' };
    }
    const verdicts = await Promise.all(
      excerpts.map(({ text }) => this.classifier.classify(text, execution))
    );
    if (verdicts.some((verdict) => !verdict.safe)) {
      return { safe: false, score, reason: 'classifier' };
    }
    if (verdicts.some((verdict) => verdict.degraded)) {
      return { safe: false, score, reason: 'classifier_degraded' };
    }
    return { safe: true, score, classified: excerpts.length };
  }
}

// Inline markup can split a phrase that only the plain text joins, while the model reads the raw
// HTML, whose hidden elements and attributes the plain text drops; so both views' hits are judged.
function excerptsOf(html: string): Excerpt[] | { score: number } {
  const excerpts: Excerpt[] = [];
  for (const view of [htmlToPlainText(html), html]) {
    const hits = hitsIn(view);
    if (!hits) {
      continue;
    }
    const found = hits.spans
      ? excerptGroups(view, hits.spans, hits.score)
      : null;
    if (!found) {
      return { score: hits.score };
    }
    excerpts.push(...found);
  }
  return excerpts;
}

function hitsIn(text: string): Hits | null {
  const detection = detectAiInput(text);
  if (detection.safe) {
    return null;
  }
  const spans = locateInjectionSpans(text);
  return {
    score: detection.score,
    spans: spans === null || spans.length === 0 ? null : spans,
  };
}

// The patterns accept any run of whitespace, so a hit padded with it is measured collapsed.
function collapse(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/** Null when a single hit is too long for the classifier to read whole. */
function excerptGroups(
  text: string,
  spans: readonly InjectionSpan[],
  score: number
): Excerpt[] | null {
  const groups: { start: number; end: number }[] = [];
  for (const span of spans) {
    const last = groups.at(-1);
    const end = Math.max(last?.end ?? 0, span.end);
    if (
      last &&
      collapse(text.slice(last.start, end)).length <= EXCERPT_CORE_MAX_CHARS
    ) {
      last.end = end;
    } else {
      groups.push({ start: span.start, end: span.end });
    }
  }
  const excerpts: Excerpt[] = [];
  for (const { start, end } of groups) {
    const core = collapse(text.slice(start, end));
    if (core.length > EXCERPT_CORE_MAX_CHARS) {
      return null;
    }
    const before = collapse(text.slice(0, start)).slice(-EXCERPT_CONTEXT_CHARS);
    const after = collapse(text.slice(end)).slice(0, EXCERPT_CONTEXT_CHARS);
    excerpts.push({ text: `${before}${core}${after}`, score });
  }
  return excerpts;
}
