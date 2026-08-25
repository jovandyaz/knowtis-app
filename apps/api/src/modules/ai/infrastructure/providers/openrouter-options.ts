import { providerOf } from '@knowtis/ai-gateway';
import type { ReasoningEffort } from '@knowtis/shared-types';

const OPENROUTER_ALLOW_FALLBACKS = true;

export interface OpenrouterRoutingInput {
  readonly model: string;
  readonly reasoningEffort?: ReasoningEffort | undefined;
  readonly providerOrder?: readonly string[] | undefined;
  /**
   * Restricts routing to upstreams supporting every parameter sent. OpenRouter
   * records support per endpoint rather than per model, so this is what keeps a
   * json_schema request off an endpoint that cannot honour the schema.
   */
  readonly requireParameters?: boolean | undefined;
}

export function openrouterProviderOptions({
  model,
  reasoningEffort,
  providerOrder,
  requireParameters,
}: OpenrouterRoutingInput) {
  if (providerOf(model) !== 'openrouter') {
    return {};
  }
  const order =
    providerOrder && providerOrder.length > 0 ? [...providerOrder] : null;
  const routed = order !== null || requireParameters === true;
  if (!reasoningEffort && !routed) {
    return {};
  }
  return {
    providerOptions: {
      openrouter: {
        ...(reasoningEffort ? { reasoning: { effort: reasoningEffort } } : {}),
        ...(routed
          ? {
              provider: {
                ...(order
                  ? { order, allow_fallbacks: OPENROUTER_ALLOW_FALLBACKS }
                  : {}),
                ...(requireParameters ? { require_parameters: true } : {}),
              },
            }
          : {}),
      },
    },
  };
}

export type OpenrouterProviderOptions = ReturnType<
  typeof openrouterProviderOptions
>;

export const OPENROUTER_ROUTING_SOURCE = Symbol('OPENROUTER_ROUTING_SOURCE');

/** Supplies the operator's vetted upstream allowlist; `[]` means no preference. */
export interface OpenRouterRoutingSource {
  getOpenRouterProviderOrder(): Promise<readonly string[]>;
}
