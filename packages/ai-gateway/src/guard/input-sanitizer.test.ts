import { describe, expect, it } from 'vitest';

import { sanitizeContent } from './input-sanitizer';

describe('sanitizeContent', () => {
  it('should preserve normal text', () => {
    expect(sanitizeContent('Hello world')).toBe('Hello world');
  });

  it('should preserve newlines and tabs', () => {
    expect(sanitizeContent('Line 1\nLine 2\tTabbed')).toBe(
      'Line 1\nLine 2\tTabbed'
    );
  });

  it('should strip control characters', () => {
    expect(sanitizeContent('Hello\x00\x01\x02 world\x7F')).toBe('Hello world');
  });

  it('should trim whitespace', () => {
    expect(sanitizeContent('  Hello  ')).toBe('Hello');
  });

  it('should handle empty string', () => {
    expect(sanitizeContent('')).toBe('');
  });
});
