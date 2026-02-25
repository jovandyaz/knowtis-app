import { useTranslation } from 'react-i18next';

import type { ZodType } from 'zod';

type SchemaTranslator = (
  key: string,
  options?: Record<string, unknown>
) => string;

export function useTranslatedSchema<T extends ZodType>(
  factory: (t: SchemaTranslator) => T,
  namespace = 'common'
): T {
  // Cast needed: namespace is a runtime string but useTranslation expects the
  // augmented namespace union from i18n.d.ts. Runtime fallback is safe.
  const { t } = useTranslation(
    namespace as 'common' | 'auth' | 'notes' | 'errors'
  );
  // t() has strict key types from i18n.d.ts augmentation, but schema factories
  // use arbitrary string keys — cast is safe since i18next falls back to the key.
  const tFn = t as unknown as SchemaTranslator;
  const translator: SchemaTranslator = (key, opts) => tFn(key, opts);
  return factory(translator);
}
