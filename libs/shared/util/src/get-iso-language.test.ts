import { describe, expect, it } from 'vitest';

import { getISOLanguage } from './get-iso-language';

describe('getISOLanguage', () => {
  it('extracts language from BCP 47 tag with region', () => {
    expect(getISOLanguage('es-ES')).toBe('es');
    expect(getISOLanguage('en-US')).toBe('en');
    expect(getISOLanguage('pt-BR')).toBe('pt');
  });

  it('returns the code as-is when already ISO-639-1', () => {
    expect(getISOLanguage('es')).toBe('es');
    expect(getISOLanguage('en')).toBe('en');
  });

  it('handles ISO-639-2 three-letter codes', () => {
    expect(getISOLanguage('zho')).toBe('zho');
    expect(getISOLanguage('zho-Hans')).toBe('zho');
  });

  it('normalizes to lowercase', () => {
    expect(getISOLanguage('EN-US')).toBe('en');
    expect(getISOLanguage('Es')).toBe('es');
  });

  it('returns undefined for empty or missing input', () => {
    expect(getISOLanguage('')).toBeUndefined();
    expect(getISOLanguage(undefined)).toBeUndefined();
  });

  it('returns undefined for invalid codes', () => {
    expect(getISOLanguage('a')).toBeUndefined();
    expect(getISOLanguage('toolong')).toBeUndefined();
  });
});
