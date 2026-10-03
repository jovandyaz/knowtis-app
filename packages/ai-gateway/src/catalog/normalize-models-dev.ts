import { z } from 'zod';

import {
  DEFAULT_MODEL_STATUS,
  deriveCanonical,
  MODEL_STATUSES,
  TOKENS_PER_MILLION,
  type IndexedModel,
  type IndexedReasoning,
  type MODELS_DEV_PROVIDERS,
  type ModelStatus,
} from './indexed-model';

const EFFORT_OPTION = 'effort';
const TOGGLE_OPTION = 'toggle';
const ISO_MONTH = /^\d{4}-\d{2}$/;
const FIRST_DAY_OF_MONTH = '01';
const PRICE_SIGNIFICANT_DIGITS = 15;
const UNRECOGNIZED_MODEL_STATUS: ModelStatus = 'alpha';

const calendarDate = z.iso.date();

const perMillionCost = z.number().nonnegative().nullish();
const tokenLimit = z.number().nonnegative().nullish();
const modalityList = z.array(z.string()).nullish();

const modelsDevEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  family: z.string().nullish(),
  release_date: z.string().nullish(),
  status: z.string().nullish(),
  tool_call: z.boolean().nullish(),
  structured_output: z.boolean().nullish(),
  modalities: z.object({ input: modalityList, output: modalityList }).nullish(),
  cost: z
    .object({
      input: perMillionCost,
      output: perMillionCost,
      cache_read: perMillionCost,
      cache_write: perMillionCost,
    })
    .nullish(),
  limit: z
    .object({ context: tokenLimit, input: tokenLimit, output: tokenLimit })
    .nullish(),
  reasoning: z.boolean().nullish(),
  reasoning_options: z
    .array(
      z.object({ type: z.string(), values: z.array(z.string()).nullish() })
    )
    .nullish(),
  canonical_model_id: z.string().min(1).nullish(),
  open_weights: z.boolean().nullish(),
});

type ModelsDevEntry = z.infer<typeof modelsDevEntrySchema>;

/** The `openrouter` section of models.dev keyed by OpenRouter id, used only to enrich OpenRouter rows. */
export interface ModelsDevEnrichment {
  readonly family: string | null;
  readonly canonical: string | null;
  readonly openWeights: boolean | null;
  readonly status: ModelStatus;
}

/** Normalizes one models.dev model entry; null when the entry fails the schema (missing id or name, negative or non-finite cost). An unrecognized status is kept as `alpha`. */
export function fromModelsDev(
  provider: (typeof MODELS_DEV_PROVIDERS)[number],
  raw: unknown
): IndexedModel | null {
  const parsed = modelsDevEntrySchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const entry = parsed.data;
  return {
    id: `${provider}:${entry.id}`,
    provider,
    name: entry.name,
    family: entry.family ?? null,
    releasedAt: toReleaseDate(entry.release_date),
    status: toModelStatus(entry.status),
    toolCall: entry.tool_call ?? null,
    structuredOutput: entry.structured_output ?? null,
    inputModalities: entry.modalities?.input ?? [],
    outputModalities: entry.modalities?.output ?? [],
    inputCostPerToken: toPerToken(entry.cost?.input),
    outputCostPerToken: toPerToken(entry.cost?.output),
    cacheReadCostPerToken: toPerToken(entry.cost?.cache_read),
    cacheWriteCostPerToken: toPerToken(entry.cost?.cache_write),
    maxInputTokens: entry.limit?.input ?? entry.limit?.context ?? null,
    maxOutputTokens: entry.limit?.output ?? null,
    reasoning: toReasoning(entry),
    canonical: deriveCanonical(
      entry.canonical_model_id ?? `${provider}/${entry.id}`
    ),
    openWeights: entry.open_weights ?? null,
    retiresAt: null,
    source: 'models_dev',
  };
}

/** Identity facts of one entry from the models.dev `openrouter` section, with the canonical id as published; null when the entry fails the schema. */
export function enrichmentFromModelsDev(
  raw: unknown
): ModelsDevEnrichment | null {
  const parsed = modelsDevEntrySchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const entry = parsed.data;
  return {
    family: entry.family ?? null,
    canonical: entry.canonical_model_id ?? null,
    openWeights: entry.open_weights ?? null,
    status: toModelStatus(entry.status),
  };
}

function toModelStatus(status: string | null | undefined): ModelStatus {
  if (status == null) {
    return DEFAULT_MODEL_STATUS;
  }
  return (
    MODEL_STATUSES.find((known) => known === status) ??
    UNRECOGNIZED_MODEL_STATUS
  );
}

function toReleaseDate(date: string | null | undefined): string | null {
  if (date == null) {
    return null;
  }
  const candidate = ISO_MONTH.test(date)
    ? `${date}-${FIRST_DAY_OF_MONTH}`
    : date;
  return calendarDate.safeParse(candidate).success ? candidate : null;
}

function toPerToken(perMillion: number | null | undefined): number | null {
  if (perMillion == null) {
    return null;
  }
  // Float division is inexact (0.2 / 1e6 = 2.0000000000000002e-7), so round back to the published decimal.
  return Number(
    (perMillion / TOKENS_PER_MILLION).toPrecision(PRICE_SIGNIFICANT_DIGITS)
  );
}

function toReasoning(entry: ModelsDevEntry): IndexedReasoning | null {
  if (entry.reasoning !== true) {
    return null;
  }
  const options = entry.reasoning_options ?? [];
  return {
    levels:
      options.find((option) => option.type === EFFORT_OPTION)?.values ?? [],
    mandatory: !options.some((option) => option.type === TOGGLE_OPTION),
  };
}
