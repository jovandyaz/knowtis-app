import { describe, expect, it } from 'vitest';

import { keyPrefixOf, keySuffixOf } from './provider-key-hint';

describe('provider key hint', () => {
  const KEY = 'sk-ant-api03-abcdefghijklmnopTgAA';

  it('takes the first 8 characters as the prefix', () => {
    expect(keyPrefixOf(KEY)).toBe('sk-ant-a');
  });

  it('takes the last 4 characters as the suffix', () => {
    expect(keySuffixOf(KEY)).toBe('TgAA');
  });

  it('gives no suffix to a key shorter than 20 characters', () => {
    expect(keySuffixOf('a'.repeat(19))).toBeNull();
  });

  it('gives a suffix to a key of exactly 20 characters', () => {
    expect(keySuffixOf('a'.repeat(20))).toBe('aaaa');
  });
});
