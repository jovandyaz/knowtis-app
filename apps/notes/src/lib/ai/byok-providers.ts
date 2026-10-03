import { isByokProvider, type ByokProvider } from '@knowtis/shared-types';

const MODEL_ID_SEPARATOR = ':';

/** The provider whose key a model id runs on (`anthropic:claude-…` → `anthropic`); null when no BYOK key serves it. */
export function providerOfModel(modelId: string): ByokProvider | null {
  const separator = modelId.indexOf(MODEL_ID_SEPARATOR);
  const provider = separator === -1 ? '' : modelId.slice(0, separator);
  return isByokProvider(provider) ? provider : null;
}
