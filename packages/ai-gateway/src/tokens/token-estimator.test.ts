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
});
