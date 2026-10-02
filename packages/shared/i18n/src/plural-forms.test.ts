import { createInstance } from 'i18next';

import enNotes from '../locales/en/notes.json';
import esNotes from '../locales/es/notes.json';

const NOTES_NAMESPACE = 'notes';
const REVIEWED_OF_KEY = 'ai.artifacts.flashcards.reviewedOf';
const IMAGE_IMPORT_FAILED_KEY = 'ai.image.importFailed';
const QUOTA_REMAINING_KEY = 'ai.copilot.quota.remaining';
const QUOTA_EXHAUSTED_KEY = 'ai.copilot.quota.exhausted';
const QUOTA_USED_LABEL_KEY = 'ai.copilot.quota.usedLabel';

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

const QUOTA_REMAINING_CASES = [
  {
    locale: 'en',
    singular: '1 message left today',
    plural: '2 messages left today',
  },
  {
    locale: 'es',
    singular: 'Te queda 1 mensaje hoy',
    plural: 'Te quedan 2 mensajes hoy',
  },
] as const;

const QUOTA_EXHAUSTED_CASES = [
  {
    locale: 'en',
    singular: 'You used your only message for today. It resets at 6:00 PM.',
    plural: 'You used your 2 messages for today. They reset at 6:00 PM.',
  },
  {
    locale: 'es',
    singular: 'Usaste tu único mensaje de hoy. Se renueva a las 6:00 PM.',
    plural: 'Usaste tus 2 mensajes de hoy. Se renuevan a las 6:00 PM.',
  },
] as const;

const QUOTA_USED_LABEL_CASES = [
  {
    locale: 'en',
    singular: 'Free: 1 of 1 message used today',
    plural: 'Free: 1 of 2 messages used today',
  },
  {
    locale: 'es',
    singular: 'Free: 1 de 1 mensaje usado hoy',
    plural: 'Free: 1 de 2 mensajes usados hoy',
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

  it.each(QUOTA_REMAINING_CASES)(
    'counts the copilot messages left today with the right plural in $locale',
    async ({ locale, singular, plural }) => {
      const i18n = await translatorFor(locale);

      expect(i18n.t(QUOTA_REMAINING_KEY, { count: 1 })).toBe(singular);
      expect(i18n.t(QUOTA_REMAINING_KEY, { count: 2 })).toBe(plural);
    }
  );

  it.each(QUOTA_EXHAUSTED_CASES)(
    'reports the spent daily messages with the right plural in $locale',
    async ({ locale, singular, plural }) => {
      const i18n = await translatorFor(locale);

      expect(i18n.t(QUOTA_EXHAUSTED_KEY, { count: 1, time: '6:00 PM' })).toBe(
        singular
      );
      expect(i18n.t(QUOTA_EXHAUSTED_KEY, { count: 2, time: '6:00 PM' })).toBe(
        plural
      );
    }
  );

  it.each(QUOTA_USED_LABEL_CASES)(
    'labels the messages used today with the right plural in $locale',
    async ({ locale, singular, plural }) => {
      const i18n = await translatorFor(locale);

      expect(
        i18n.t(QUOTA_USED_LABEL_KEY, { tier: 'Free', used: 1, count: 1 })
      ).toBe(singular);
      expect(
        i18n.t(QUOTA_USED_LABEL_KEY, { tier: 'Free', used: 1, count: 2 })
      ).toBe(plural);
    }
  );
});
