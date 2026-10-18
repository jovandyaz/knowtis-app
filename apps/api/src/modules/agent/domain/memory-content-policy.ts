import { detectPromptInjection } from '@knowtis/ai-gateway';
import { MEMORY_MAX_CHARS } from '@knowtis/shared-types';

const UNSTORABLE_PATTERNS: readonly RegExp[] = [
  /[a-z][a-z\d+.-]*:\/\//i,
  /\bwww\./i,
  /\bdata:[a-z]+\/[\w.+-]+[;,]/i,
  /\b(?:javascript|vbscript):/i,
  /[\p{L}\p{N}._%+-]+@(?:[\p{L}\p{N}-]+\.)+\p{L}{2,}/u,
  /\]\(/,
  /\]\[/,
  /^\s*\[[^\]]+\]:/m,
  /<\/?[a-z][^>]*>/i,
  /<!--/,
  /```|~~~/,
  /[\p{Cc}\p{Zl}\p{Zp}\u{E0100}-\u{E01EF}]/u,
  /[\uFE00-\uFE0F]{2,}/u,
  /(?:^|\s)[\uFE00-\uFE0F]/u,
  /(?!\u200D)\p{Cf}/u,
];

const NORMAL_FORM = 'NFKC';

/**
 * Whether a candidate memory may be stored: a short plain-text fact with no URL, email address, link
 * or image syntax, HTML, code fence, control, separator, supplementary variation-selector or invisible
 * formatting character (the zero-width joiner of emoji sequences aside), or a variation selector that
 * does not follow a base character on its own, checked as written and in NFKC form so
 * fullwidth look-alikes count. A memory is replayed into every later prompt, so anything a renderer
 * could turn into a request, a model into structure, or a later share or send into a recipient never
 * persists.
 */
export function isStorableMemory(content: string): boolean {
  return (
    content.trim().length > 0 &&
    content.length <= MEMORY_MAX_CHARS &&
    [content, content.normalize(NORMAL_FORM)].every(
      (form) => !UNSTORABLE_PATTERNS.some((pattern) => pattern.test(form))
    )
  );
}

/** Whether a stored memory may reach a prompt: it passes the content policy and the injection heuristic, which memories stored before either existed may not. */
export function isRecallableMemory(content: string): boolean {
  return isStorableMemory(content) && detectPromptInjection(content).safe;
}
