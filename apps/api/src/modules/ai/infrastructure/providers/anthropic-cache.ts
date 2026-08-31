import { providerOf } from '@knowtis/ai-gateway';

const EPHEMERAL = {
  anthropic: { cacheControl: { type: 'ephemeral' as const } },
};

interface CacheableSystemMessage {
  readonly role: 'system';
  readonly content: string;
  readonly providerOptions: typeof EPHEMERAL;
}

export function cacheableInstructions(
  model: string,
  instructions: string
): { instructions: string | CacheableSystemMessage } {
  if (providerOf(model) !== 'anthropic') {
    return { instructions };
  }
  return {
    instructions: {
      role: 'system',
      content: instructions,
      providerOptions: EPHEMERAL,
    },
  };
}

function readProviderOptions(message: object): Record<string, unknown> {
  if (
    'providerOptions' in message &&
    typeof message.providerOptions === 'object' &&
    message.providerOptions !== null
  ) {
    return { ...message.providerOptions };
  }
  return {};
}

export function withLastMessageCache<T extends object>(
  model: string,
  messages: readonly T[]
): T[] {
  const last = messages.at(-1);
  if (providerOf(model) !== 'anthropic' || !last) {
    return [...messages];
  }
  const existing = readProviderOptions(last);
  const anthropic =
    typeof existing.anthropic === 'object' && existing.anthropic !== null
      ? existing.anthropic
      : {};
  return [
    ...messages.slice(0, -1),
    {
      ...last,
      providerOptions: {
        ...existing,
        anthropic: { ...anthropic, ...EPHEMERAL.anthropic },
      },
    },
  ];
}
