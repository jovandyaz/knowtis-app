import { initReactI18next } from 'react-i18next';

import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import {
  DEFAULT_LOCALE,
  enAuth,
  enCommon,
  enErrors,
  enNotes,
  esAuth,
  esCommon,
  esErrors,
  esNotes,
  I18N_STORAGE_KEY,
  SUPPORTED_LOCALES,
} from '@knowtis/shared-i18n';

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        auth: enAuth,
        notes: enNotes,
        errors: enErrors,
      },
      es: {
        common: esCommon,
        auth: esAuth,
        notes: esNotes,
        errors: esErrors,
      },
    },
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...SUPPORTED_LOCALES],
    defaultNS: 'common',
    ns: ['common', 'auth', 'notes', 'errors'],
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
      lookupLocalStorage: I18N_STORAGE_KEY,
    },
  });

export default i18n;
