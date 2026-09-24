import { createInstance } from 'i18next';

import enNotes from '../locales/en/notes.json';
import esNotes from '../locales/es/notes.json';

const NOTES_NAMESPACE = 'notes';
const REVIEWED_OF_KEY = 'ai.artifacts.flashcards.reviewedOf';
const IMAGE_IMPORT_FAILED_KEY = 'ai.image.importFailed';

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

const IMAGE_IMPORT_FAILED_CASES = [
  {
    locale: 'en',
    singular: "Couldn't copy 1 image into the note",
    plural: "Couldn't copy 2 images into the note",
  },
  {
    locale: 'es',
    singular: 'No se pudo copiar 1 imagen a la nota',
    plural: 'No se pudieron copiar 2 imágenes a la nota',
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
  it.each([
    {
      locale: 'en',
      count: 1,
      rated: 'Recorded: Recalled. 1 of 1 completed.',
      skipped: 'Card skipped. 1 of 1 completed.',
    },
    {
      locale: 'en',
      count: 2,
      rated: 'Recorded: Recalled. 1 of 2 completed.',
      skipped: 'Card skipped. 1 of 2 completed.',
    },
    {
      locale: 'es',
      count: 1,
      rated: 'Registrado: Lo recordé. 1 de 1 completada.',
      skipped: 'Tarjeta omitida. 1 de 1 completada.',
    },
    {
      locale: 'es',
      count: 2,
      rated: 'Registrado: Lo recordé. 1 de 2 completadas.',
      skipped: 'Tarjeta omitida. 1 de 2 completadas.',
    },
  ] as const)(
    'announces flashcard progress in $locale with count $count',
    async ({ locale, count, rated, skipped }) => {
      const i18n = await translatorFor(locale);
      expect(
        i18n.t('ai.artifacts.flashcards.announce.rated', {
          rating: i18n.t('ai.artifacts.flashcards.quality.good'),
          done: 1,
          count,
        })
      ).toBe(rated);
      expect(
        i18n.t('ai.artifacts.flashcards.announce.skipped', { done: 1, count })
      ).toBe(skipped);
    }
  );
  it.each(REVIEWED_OF_CASES)(
    'counts reviewed cards with the right plural in $locale',
    async ({ locale, singular, plural }) => {
      const i18n = await translatorFor(locale);

      expect(i18n.t(REVIEWED_OF_KEY, { reviewed: 1, count: 1 })).toBe(singular);
      expect(i18n.t(REVIEWED_OF_KEY, { reviewed: 1, count: 2 })).toBe(plural);
    }
  );

  it.each(IMAGE_IMPORT_FAILED_CASES)(
    'counts images that could not be copied into the note with the right plural in $locale',
    async ({ locale, singular, plural }) => {
      const i18n = await translatorFor(locale);

      expect(i18n.t(IMAGE_IMPORT_FAILED_KEY, { count: 1 })).toBe(singular);
      expect(i18n.t(IMAGE_IMPORT_FAILED_KEY, { count: 2 })).toBe(plural);
    }
  );
});
