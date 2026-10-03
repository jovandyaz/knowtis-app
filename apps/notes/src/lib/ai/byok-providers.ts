import {
  isByokProvider,
  type AIPreferences,
  type ByokProvider,
  type ProviderKeyInfo,
} from '@knowtis/shared-types';

const MODEL_ID_SEPARATOR = ':';

/** The provider whose key a model id runs on (`anthropic:claude-…` → `anthropic`); null when no BYOK key serves it. */
export function providerOfModel(modelId: string): ByokProvider | null {
  const separator = modelId.indexOf(MODEL_ID_SEPARATOR);
  const provider = separator === -1 ? '' : modelId.slice(0, separator);
  return isByokProvider(provider) ? provider : null;
}

/** Keys oldest first, ties broken by provider: the order the server routes them in. */
export function keysInAddedOrder(
  keys: readonly ProviderKeyInfo[]
): ProviderKeyInfo[] {
  return [...keys].sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) ||
      a.provider.localeCompare(b.provider)
  );
}

/** The provider a byok caller's intents prefer: the stored one while its key is held, else the first key added. */
export function effectivePrimaryProvider(
  preferences: Pick<AIPreferences, 'primaryProvider'> | undefined,
  keys: readonly ProviderKeyInfo[]
): ByokProvider | null {
  const stored = preferences?.primaryProvider ?? null;
  if (stored !== null && keys.some((key) => key.provider === stored)) {
    return stored;
  }
  return keysInAddedOrder(keys)[0]?.provider ?? null;
}
