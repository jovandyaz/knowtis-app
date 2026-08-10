import { encode } from 'gpt-tokenizer';

/**
 * BPE merging is quadratic in the length of an unbroken token run, so a long
 * repetition of one character costs ~1s at 48k chars. Chunking bounds that run
 * length; boundaries cost under 0.2% drift on real text.
 */
const ENCODE_CHUNK_CHARS = 4_000;

/** Approximate token count. Chunk boundaries make it drift under 1% from an exact encode. */
export function estimateTokenCount(text: string): number {
  let total = 0;

  for (let offset = 0; offset < text.length; offset += ENCODE_CHUNK_CHARS) {
    total += encode(text.slice(offset, offset + ENCODE_CHUNK_CHARS)).length;
  }

  return total;
}
