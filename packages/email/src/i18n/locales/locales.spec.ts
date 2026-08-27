import { SUPPORTED_LOCALES, type Locale } from '../config';
import * as en from './en';
import * as es from './es';

const catalogs: Record<Locale, unknown> = { en, es };

const collectKeys = (value: unknown, prefix = ''): string[] => {
  if (typeof value !== 'object' || value === null) {
    return [prefix];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(
    ([key, nested]) => collectKeys(nested, prefix ? `${prefix}.${key}` : key)
  );
};

describe('locale catalogs', () => {
  it('declares the same keys in every supported locale', () => {
    const [reference, ...rest] = SUPPORTED_LOCALES;
    const referenceKeys = collectKeys(catalogs[reference]).sort();

    for (const locale of rest) {
      expect({
        locale,
        keys: collectKeys(catalogs[locale]).sort(),
      }).toEqual({ locale, keys: referenceKeys });
    }
  });
});
