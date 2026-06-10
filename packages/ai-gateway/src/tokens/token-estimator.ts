import { encode } from 'gpt-tokenizer';

export function estimateTokenCount(text: string): number {
  return encode(text).length;
}
