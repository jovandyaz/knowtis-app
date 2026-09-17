import { describe, expect, it } from 'vitest';

import { isMacPlatform, modifierKeyLabel } from './platform';

const MAC_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15';
const WINDOWS_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128.0';

describe('isMacPlatform', () => {
  it('is true for a Macintosh user agent', () => {
    expect(isMacPlatform(MAC_UA)).toBe(true);
  });

  it('is false for a Windows user agent', () => {
    expect(isMacPlatform(WINDOWS_UA)).toBe(false);
  });

  it('is false for an empty user agent', () => {
    expect(isMacPlatform('')).toBe(false);
  });
});

describe('modifierKeyLabel', () => {
  it('names the command key on macOS', () => {
    expect(modifierKeyLabel(MAC_UA)).toBe('⌘');
  });

  it('names Ctrl elsewhere', () => {
    expect(modifierKeyLabel(WINDOWS_UA)).toBe('Ctrl');
  });
});
