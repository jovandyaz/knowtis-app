/**
 * Raw tool-call markup a model can write into its answer text when its host
 * renders the tools but does not parse the calls: DeepSeek's DSML
 * (`<｜DSML｜function_calls>`, with U+FF5C fullwidth bars).
 */
export const LEAKED_TOOL_MARKUP = ['｜DSML｜'] as const;

// The markers open tags, and a stray bracket reaching the client would count
// as streamed answer text, which rules out failing the call over.
const TAG_OPENERS = ['</', '<', ''] as const;

const LEAK_FORMS = LEAKED_TOOL_MARKUP.flatMap((marker) =>
  TAG_OPENERS.map((opener) => `${opener}${marker}`)
);

export interface ToolMarkupScan {
  /** Text safe to stream: all of it before any markup, minus a tail that could still open some. */
  readonly emit: string;
  /** Tail held back until the next delta shows whether it opens markup; flush it when the text ends. */
  readonly held: string;
  readonly leaked: boolean;
}

function leakIndex(text: string): number {
  return LEAK_FORMS.reduce((first, form) => {
    const at = text.indexOf(form);
    return at !== -1 && (first === -1 || at < first) ? at : first;
  }, -1);
}

function openingTailLength(text: string): number {
  let longest = 0;
  for (const form of LEAK_FORMS) {
    for (let length = form.length - 1; length > longest; length--) {
      if (text.endsWith(form.slice(0, length))) {
        longest = length;
        break;
      }
    }
  }
  return longest;
}

/**
 * Scans one text delta, `held` being the tail the previous scan kept back.
 * Once `leaked`, the text from the markup on must never be streamed, stored
 * or replayed.
 */
export function scanForToolMarkup(held: string, delta: string): ToolMarkupScan {
  const text = `${held}${delta}`;
  const at = leakIndex(text);
  if (at !== -1) {
    return { emit: text.slice(0, at), held: '', leaked: true };
  }
  const keep = text.length - openingTailLength(text);
  return { emit: text.slice(0, keep), held: text.slice(keep), leaked: false };
}
