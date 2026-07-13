import { providerOf } from '@knowtis/ai-gateway';

const EPHEMERAL = {
  anthropic: { cacheControl: { type: 'ephemeral' as const } },
};

interface CacheableSystemMessage {
  readonly role: 'system';
  readonly content: string;
  readonly providerOptions: typeof EPHEMERAL;
}

export function cacheableSystem(
  model: string,
  system: string
): { system: string | CacheableSystemMessage } {
  if (providerOf(model) !== 'anthropic') {
    return { system };
  }
  return {
    system: { role: 'system', content: system, providerOptions: EPHEMERAL },
  };
}

export function withLastMessageCache<T extends object>(
  model: string,
  messages: readonly T[]
): T[] {
  const last = messages.at(-1);
  if (providerOf(model) !== 'anthropic' || !last) {
    return [...messages];
  }
  return [...messages.slice(0, -1), { ...last, providerOptions: EPHEMERAL }];
}
