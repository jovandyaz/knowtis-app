import {
  DEFAULT_MODEL_STATUS,
  deriveCanonical,
  type IndexedModel,
} from './indexed-model';
import type { ModelsDevEnrichment } from './normalize-models-dev';

const TOOLS_PARAMETER = 'tools';
const STRUCTURED_OUTPUT_PARAMETERS = [
  'structured_outputs',
  'response_format',
] as const;
const ISO_DATE_LENGTH = 'YYYY-MM-DD'.length;

/** The already-validated OpenRouter `/models` entry this normalizer reads. Costs are USD per token. */
export interface OpenRouterModelInput {
  readonly id: string;
  readonly name: string;
  readonly createdAt: Date;
  readonly contextLength: number;
  readonly maxCompletionTokens: number | null;
  readonly promptCostPerToken: number;
  readonly completionCostPerToken: number;
  readonly cacheReadCostPerToken: number | null;
  readonly cacheWriteCostPerToken: number | null;
  readonly expirationDate: Date | null;
  readonly inputModalities: readonly string[];
  readonly outputModalities: readonly string[];
  readonly supportedParameters: readonly string[];
  readonly reasoning: {
    readonly levels: readonly string[];
    readonly mandatory: boolean;
  } | null;
}

/** Normalizes one OpenRouter model; family, canonical id, open weights and status come from its models.dev entry when one exists. An invalid date becomes null. */
export function fromOpenRouter(
  model: OpenRouterModelInput,
  enrichment: ModelsDevEnrichment | null
): IndexedModel {
  return {
    id: `openrouter:${model.id}`,
    provider: 'openrouter',
    name: model.name,
    family: enrichment?.family ?? null,
    releasedAt: toUtcDate(model.createdAt),
    status: enrichment?.status ?? DEFAULT_MODEL_STATUS,
    toolCall: model.supportedParameters.includes(TOOLS_PARAMETER),
    structuredOutput: STRUCTURED_OUTPUT_PARAMETERS.some((parameter) =>
      model.supportedParameters.includes(parameter)
    ),
    inputModalities: model.inputModalities,
    outputModalities: model.outputModalities,
    inputCostPerToken: model.promptCostPerToken,
    outputCostPerToken: model.completionCostPerToken,
    cacheReadCostPerToken: model.cacheReadCostPerToken,
    cacheWriteCostPerToken: model.cacheWriteCostPerToken,
    maxInputTokens: model.contextLength,
    maxOutputTokens: model.maxCompletionTokens,
    reasoning: model.reasoning,
    canonical: deriveCanonical(enrichment?.canonical ?? model.id),
    openWeights: enrichment?.openWeights ?? null,
    retiresAt: model.expirationDate ? toUtcDate(model.expirationDate) : null,
    source: 'openrouter',
  };
}

function toUtcDate(date: Date): string | null {
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString().slice(0, ISO_DATE_LENGTH);
}
