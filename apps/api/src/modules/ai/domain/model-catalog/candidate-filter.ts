import { CANDIDATE_MAX_OUTPUT_COST_PER_TOKEN } from '@knowtis/shared-types';

import type { CandidateUpsert } from '../ports/ai-catalog.repository';
import type { UpstreamModel } from '../ports/openrouter-models.port';
import {
  CURATED_MODEL_IDS,
  OPENROUTER_ID_PREFIX,
} from './selectable-models.catalog';

export const OPEN_WEIGHT_AUTHORS = [
  'deepseek',
  'z-ai',
  'moonshotai',
  'minimax',
  'qwen',
  'meta-llama',
  'mistralai',
] as const;

export const MIN_CANDIDATE_CONTEXT_TOKENS = 128_000;

const OPEN_WEIGHT_AUTHOR_SET: ReadonlySet<string> = new Set(
  OPEN_WEIGHT_AUTHORS
);
const AUTHOR_SEPARATOR = '/';
const VARIANT_SEPARATOR = ':';
const TEXT_MODALITY = 'text';

function catalogId(upstreamId: string): string {
  return `${OPENROUTER_ID_PREFIX}${upstreamId}`;
}

function emitsTextOnly(model: UpstreamModel): boolean {
  return (
    model.outputModalities.length === 1 &&
    model.outputModalities[0] === TEXT_MODALITY
  );
}

/**
 * True when the model may be stored as a promotable catalog candidate.
 *
 * Variant suffixes are excluded outright: `:batch` cannot serve a streaming
 * turn, and a variant of a curated model would otherwise slip past the
 * curated-id exclusion, which matches on the exact id.
 */
export function isCatalogCandidate(model: UpstreamModel): boolean {
  const [author] = model.id.split(AUTHOR_SEPARATOR);
  return (
    OPEN_WEIGHT_AUTHOR_SET.has(author) &&
    !model.id.includes(VARIANT_SEPARATOR) &&
    !CURATED_MODEL_IDS.has(catalogId(model.id)) &&
    model.contextLength >= MIN_CANDIDATE_CONTEXT_TOKENS &&
    emitsTextOnly(model) &&
    model.completionCostPerToken <= CANDIDATE_MAX_OUTPUT_COST_PER_TOKEN
  );
}

export function toCandidateUpsert(model: UpstreamModel): CandidateUpsert {
  return {
    id: catalogId(model.id),
    label: model.name,
    description: model.description,
    inputCostPerToken: model.promptCostPerToken,
    outputCostPerToken: model.completionCostPerToken,
    maxInputTokens: model.contextLength,
    maxOutputTokens: model.maxCompletionTokens,
    intelligenceIndex: model.intelligenceIndex,
    upstreamCreatedAt: model.createdAt,
    upstreamExpirationDate: model.expirationDate,
  };
}
