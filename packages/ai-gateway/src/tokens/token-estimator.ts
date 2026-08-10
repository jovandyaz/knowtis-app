import { encode } from 'gpt-tokenizer';

/**
 * BPE merging is quadratic in the length of an unbroken token run, so a long
 * repetition of one character costs ~1s at 48k chars. Chunking bounds that run
 * length; boundaries cost under 0.2% drift on real text.
 */
const ENCODE_CHUNK_CHARS = 4_000;

/**
 * gpt-tokenizer throws on text holding `<|endoftext|>` and friends. Notes and
 * model output are untrusted text, so specials count as ordinary tokens —
 * otherwise a chunk boundary would decide whether estimating throws.
 */
const COUNT_SPECIALS_AS_TEXT = { disallowedSpecial: new Set<string>() };

/** Approximate token count. Never throws. Chunk boundaries drift it under 1% from an exact encode. */
export function estimateTokenCount(text: string): number {
  let total = 0;

  for (let offset = 0; offset < text.length; offset += ENCODE_CHUNK_CHARS) {
    total += encode(
      text.slice(offset, offset + ENCODE_CHUNK_CHARS),
      COUNT_SPECIALS_AS_TEXT
    ).length;
  }

  return total;
}
