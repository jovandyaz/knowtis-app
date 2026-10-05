import { BYOK_PROVIDERS, type ByokProvider } from '@knowtis/shared-types';

const BYOK_PROVIDER_SET = new Set<string>(BYOK_PROVIDERS);

export function toByokProvider(raw: string): ByokProvider {
  if (!BYOK_PROVIDER_SET.has(raw)) {
    throw new Error(`Invalid BYOK provider value in persistence: ${raw}`);
  }
  return raw as ByokProvider;
}
