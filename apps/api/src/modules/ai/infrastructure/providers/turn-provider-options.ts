import type { AnthropicLanguageModelOptions } from '@ai-sdk/anthropic';
import type { GoogleLanguageModelOptions } from '@ai-sdk/google';
import type { OpenAILanguageModelResponsesOptions } from '@ai-sdk/openai';

import { OPENROUTER_PROVIDER, providerOf } from '@knowtis/ai-gateway';
import type { ReasoningEffort } from '@knowtis/shared-types';

const OPENROUTER_ALLOW_FALLBACKS = true;

/** Where our effort ladder overlaps Gemini's `thinkingConfig.thinkingLevel`; the declared google ladders stay inside it, so a level above the overlap sends no thinking config rather than a silently clamped one. */
const GOOGLE_THINKING_LEVELS = [
  'low',
  'medium',
  'high',
] as const satisfies readonly NonNullable<
  NonNullable<GoogleLanguageModelOptions['thinkingConfig']>['thinkingLevel']
>[];
type GoogleThinkingLevel = (typeof GOOGLE_THINKING_LEVELS)[number];

function isGoogleThinkingLevel(
  effort: ReasoningEffort
): effort is GoogleThinkingLevel {
  return (GOOGLE_THINKING_LEVELS as readonly string[]).includes(effort);
}

export interface TurnProviderOptionsInput {
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

function openrouterBlock({
  reasoningEffort,
  providerOrder,
  requireParameters,
}: TurnProviderOptionsInput) {
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

function anthropicBlock(effort: ReasoningEffort) {
  const anthropic: Pick<AnthropicLanguageModelOptions, 'thinking' | 'effort'> =
    {
      thinking: { type: 'adaptive', display: 'summarized' },
      effort,
    };
  return { providerOptions: { anthropic } };
}

function openaiBlock(effort: ReasoningEffort) {
  const openai: Pick<OpenAILanguageModelResponsesOptions, 'reasoningEffort'> = {
    reasoningEffort: effort,
  };
  return { providerOptions: { openai } };
}

function googleBlock(effort: ReasoningEffort) {
  if (!isGoogleThinkingLevel(effort)) {
    return {};
  }
  const google: Pick<GoogleLanguageModelOptions, 'thinkingConfig'> = {
    thinkingConfig: { thinkingLevel: effort, includeThoughts: true },
  };
  return { providerOptions: { google } };
}

/**
 * The `providerOptions` block a turn sends for its model: OpenRouter routing
 * plus reasoning, or the provider-native reasoning control for a direct
 * provider. Empty when there is nothing to say.
 */
export function turnProviderOptions(input: TurnProviderOptionsInput) {
  const provider = providerOf(input.model);
  if (provider === OPENROUTER_PROVIDER) {
    return openrouterBlock(input);
  }
  const effort = input.reasoningEffort;
  if (!effort) {
    return {};
  }
  switch (provider) {
    case 'anthropic':
      return anthropicBlock(effort);
    case 'openai':
      return openaiBlock(effort);
    case 'google':
      return googleBlock(effort);
    default:
      return {};
  }
}

export type TurnProviderOptions = ReturnType<typeof turnProviderOptions>;

export const OPENROUTER_ROUTING_SOURCE = Symbol('OPENROUTER_ROUTING_SOURCE');

/** Supplies the operator's vetted upstream allowlist; `[]` means no preference. */
export interface OpenRouterRoutingSource {
  getOpenRouterProviderOrder(): Promise<readonly string[]>;
}
