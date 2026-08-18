import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const LOCALES_DIR = fileURLToPath(new URL('../locales', import.meta.url));
const REFERENCE_LOCALE = 'en';

function localeNames(): string[] {
  return readdirSync(LOCALES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

function namespaceFiles(locale: string): string[] {
  return readdirSync(join(LOCALES_DIR, locale))
    .filter((file) => file.endsWith('.json'))
    .sort();
}

function bundleOf(locale: string, namespace: string): unknown {
  return JSON.parse(readFileSync(join(LOCALES_DIR, locale, namespace), 'utf8'));
}

function keyPathsOf(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) =>
    keyPathsOf(child, prefix ? `${prefix}.${key}` : key)
  );
}

const REFERENCE_NAMESPACES = namespaceFiles(REFERENCE_LOCALE);
const TRANSLATED_LOCALES = localeNames().filter(
  (locale) => locale !== REFERENCE_LOCALE
);

describe('locale parity', () => {
  it('has locales to compare against the reference', () => {
    expect(REFERENCE_NAMESPACES.length).toBeGreaterThan(0);
    expect(TRANSLATED_LOCALES.length).toBeGreaterThan(0);
  });

  describe.each(TRANSLATED_LOCALES)('%s', (locale) => {
    it(`ships the same namespaces as ${REFERENCE_LOCALE}`, () => {
      expect(namespaceFiles(locale)).toEqual(REFERENCE_NAMESPACES);
    });

    it.each(REFERENCE_NAMESPACES)(
      `%s carries every ${REFERENCE_LOCALE} key and no orphans`,
      (namespace) => {
        const reference = new Set(
          keyPathsOf(bundleOf(REFERENCE_LOCALE, namespace))
        );
        const translated = new Set(keyPathsOf(bundleOf(locale, namespace)));

        expect({
          missing: [...reference].filter((key) => !translated.has(key)),
          orphaned: [...translated].filter((key) => !reference.has(key)),
        }).toEqual({ missing: [], orphaned: [] });
      }
    );
  });
});
