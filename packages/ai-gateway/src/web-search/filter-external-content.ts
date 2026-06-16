import { detectPromptInjection } from '../guard/prompt-guard';
import type { WebSearchHit } from './web-search.types';

export interface SafeExternalSource {
  readonly title: string;
  readonly url: string;
  readonly snippet: string;
}

export function filterExternalHits(
  hits: readonly WebSearchHit[],
  opts: { readonly maxHits: number; readonly maxChars: number }
): SafeExternalSource[] {
  return hits
    .filter((h) => detectPromptInjection(h.content).safe)
    .slice(0, opts.maxHits)
    .map((h) => ({
      title: h.title,
      url: h.url,
      snippet: h.content.slice(0, opts.maxChars),
    }));
}
