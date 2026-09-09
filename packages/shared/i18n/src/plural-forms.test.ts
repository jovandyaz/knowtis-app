import { createInstance } from 'i18next';

import enNotes from '../locales/en/notes.json';
import esNotes from '../locales/es/notes.json';

const NOTES_NAMESPACE = 'notes';
const REVIEWED_OF_KEY = 'ai.artifacts.flashcards.reviewedOf';

const BUNDLES = { en: enNotes, es: esNotes };

const REVIEWED_OF_CASES = [
  {
    locale: 'en',
    singular: '1 of 1 card reviewed',
    plural: '1 of 2 cards reviewed',
  },
  {
    locale: 'es',
    singular: '1 de 1 tarjeta repasada',
    plural: '1 de 2 tarjetas repasadas',
  },
] as const;

async function translatorFor(locale: keyof typeof BUNDLES) {
  const instance = createInstance({
    lng: locale,
    defaultNS: NOTES_NAMESPACE,
    resources: { [locale]: { [NOTES_NAMESPACE]: BUNDLES[locale] } },
  });
  await instance.init();
  return instance;
}

describe('plural forms', () => {
  it.each(REVIEWED_OF_CASES)(
    'counts reviewed cards with the right plural in $locale',
    async ({ locale, singular, plural }) => {
      const i18n = await translatorFor(locale);

      expect(i18n.t(REVIEWED_OF_KEY, { reviewed: 1, count: 1 })).toBe(singular);
      expect(i18n.t(REVIEWED_OF_KEY, { reviewed: 1, count: 2 })).toBe(plural);
    }
  );
});
