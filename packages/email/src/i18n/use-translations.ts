import type { Locale } from './config';
import * as en from './locales/en';
import * as es from './locales/es';
import type { InterpolationVariables } from './types';
import { interpolate } from './utils/interpolate';

/**
 * Available locales mapping
 */
const locales = { en, es } as const;

/**
 * Available namespace names
 */
export type Namespace = keyof typeof en;

/**
 * Type for the translation function
 */
interface TranslateFunction {
  (key: string, variables?: InterpolationVariables): string;
}

/**
 * Get a nested value from an object using dot notation
 */
function getNestedValue(obj: unknown, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }

  return current;
}

/**
 * Parse a translation key with namespace prefix
 * @param key - Key in format "namespace:path.to.key"
 * @returns Object with namespace and path
 */
function parseKey(key: string): { namespace: Namespace | null; path: string } {
  const colonIndex = key.indexOf(':');

  if (colonIndex === -1) {
    return { namespace: null, path: key };
  }

  return {
    namespace: key.slice(0, colonIndex) as Namespace,
    path: key.slice(colonIndex + 1),
  };
}

/**
 * Creates a translation function for a specific locale
 *
 * @param locale - The current locale ('en' | 'es')
 * @returns A translation function `t` that can be used to get translated strings
 */
export function useTranslations(locale: Locale): { t: TranslateFunction } {
  const currentLocale = locales[locale];

  const t = ((key: string, variables?: InterpolationVariables): string => {
    const { namespace, path } = parseKey(key);

    if (!namespace) {
      console.warn(
        `Missing namespace in key: "${key}". Use format "namespace:key"`
      );
      return key;
    }

    const namespaceMessages = currentLocale[namespace];

    if (!namespaceMessages) {
      console.warn(`Unknown namespace: "${namespace}"`);
      return key;
    }

    const value = getNestedValue(namespaceMessages, path);

    if (typeof value !== 'string') {
      console.warn(`Missing translation for key: "${key}"`);
      return key;
    }

    if (variables) {
      return interpolate(value, variables);
    }

    return value;
  }) as TranslateFunction;

  return { t };
}
