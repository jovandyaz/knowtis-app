import { providerOf } from '@knowtis/ai-gateway';
import type { ReasoningEffort } from '@knowtis/shared-types';

const OPENROUTER_ALLOW_FALLBACKS = true;

export function openrouterProviderOptions(
  model: string,
  reasoningEffort: ReasoningEffort | undefined,
  providerOrder: readonly string[] | undefined
) {
  if (providerOf(model) !== 'openrouter') {
    return {};
  }
  const order =
    providerOrder && providerOrder.length > 0 ? [...providerOrder] : null;
  if (!reasoningEffort && !order) {
    return {};
  }
  return {
    providerOptions: {
      openrouter: {
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        ...(order
          ? { provider: { order, allow_fallbacks: OPENROUTER_ALLOW_FALLBACKS } }
          : {}),
      },
    },
  };
}

export type OpenrouterProviderOptions = ReturnType<
  typeof openrouterProviderOptions
>;
