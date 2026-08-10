import { encode } from 'gpt-tokenizer';
import { describe, expect, it } from 'vitest';

import { estimateTokenCount } from './token-estimator';

describe('estimateTokenCount', () => {
  it('should return token count for a simple string', () => {
    const count = estimateTokenCount('Hello world');
    expect(count).toBeGreaterThan(0);
    expect(count).toBe(2);
  });

  it('should return 0 for empty string', () => {
    expect(estimateTokenCount('')).toBe(0);
  });

  it('should handle longer text', () => {
    const text = 'The quick brown fox jumps over the lazy dog';
    const count = estimateTokenCount(text);
    expect(count).toBeGreaterThan(5);
    expect(count).toBeLessThan(text.length);
  });

  it(
    'should count a long run of one character without quadratic blow-up',
    { timeout: 500 },
    () => {
      expect(estimateTokenCount('a'.repeat(48_000))).toBe(6000);
    }
  );

  it('should survive a chunk boundary that splits a surrogate pair', () => {
    const text = `${'a'.repeat(3_999)}\u{1F600}${'b'.repeat(100)}`;

    expect(text.charCodeAt(3_999)).toBeGreaterThanOrEqual(0xd800);
    expect(estimateTokenCount(text)).toBeGreaterThan(0);
  });

  it('should stay within 1% of an exact encode for prose', () => {
    const sentence =
      'the quick brown fox jumps over a lazy dog while writing notes ';
    const text = sentence.repeat(Math.ceil(48_000 / sentence.length));
    const exact = encode(text).length;

    const drift = Math.abs(estimateTokenCount(text) - exact) / exact;

    expect(drift).toBeLessThan(0.01);
  });
});
