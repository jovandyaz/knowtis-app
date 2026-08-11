import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import type {
  OpenRouterModelsClient,
  UpstreamCatalog,
  UpstreamModel,
} from '../../domain/ports/openrouter-models.port';

const OPENROUTER_MODELS_URL = 'https://openrouter.ai/api/v1/models';
const OPENROUTER_ORIGIN = new URL(OPENROUTER_MODELS_URL).origin;
const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_MODEL_PAGES = 20;

const MS_PER_SECOND = 1_000;
const MS_PER_DAY = 86_400_000;
/** OpenRouter flags perpetual models with a far-future sentinel date (`2098-12-31`) instead of null. */
const EXPIRATION_SENTINEL_HORIZON_MS = 10 * 365 * MS_PER_DAY;

const DISCARD_LOG_SAMPLE_SIZE = 10;
const UNKNOWN_MODEL_ID = '<unparseable>';

const costPerTokenSchema = z
  .string()
  .refine((raw) => raw.trim().length > 0)
  .transform(Number)
  .refine((cost) => Number.isFinite(cost) && cost >= 0);

const upstreamModelSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullish(),
  created: z.number().int().nonnegative(),
  context_length: z.number().int().positive(),
  architecture: z
    .object({ output_modalities: z.array(z.string()).nullish() })
    .nullish(),
  pricing: z.object({
    prompt: costPerTokenSchema,
    completion: costPerTokenSchema,
  }),
  top_provider: z
    .object({ max_completion_tokens: z.number().int().positive().nullish() })
    .nullish(),
  expiration_date: z.string().nullish(),
  benchmarks: z
    .object({
      artificial_analysis: z
        .object({ intelligence_index: z.number().nullish() })
        .nullish(),
    })
    .nullish(),
});

const modelsPageSchema = z.object({
  data: z.array(z.unknown()),
  links: z.object({ next: z.string().nullish() }).nullish(),
});

const modelIdSchema = z.object({ id: z.string() });

type ParsedUpstreamModel = z.infer<typeof upstreamModelSchema>;

function toExpirationDate(raw: string | null | undefined): Date | null {
  if (!raw) {
    return null;
  }
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.getTime() - Date.now() > EXPIRATION_SENTINEL_HORIZON_MS
    ? null
    : date;
}

function toUpstreamModel(raw: ParsedUpstreamModel): UpstreamModel {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description ?? '',
    createdAt: new Date(raw.created * MS_PER_SECOND),
    contextLength: raw.context_length,
    maxCompletionTokens: raw.top_provider?.max_completion_tokens ?? null,
    promptCostPerToken: raw.pricing.prompt,
    completionCostPerToken: raw.pricing.completion,
    expirationDate: toExpirationDate(raw.expiration_date),
    intelligenceIndex:
      raw.benchmarks?.artificial_analysis?.intelligence_index ?? null,
    outputModalities: raw.architecture?.output_modalities ?? [],
  };
}

function idOf(raw: unknown): string {
  const parsed = modelIdSchema.safeParse(raw);
  return parsed.success ? parsed.data.id : UNKNOWN_MODEL_ID;
}

function resolveUrl(raw: string, base: string): URL | null {
  try {
    return new URL(raw, base);
  } catch {
    return null;
  }
}

@Injectable()
export class OpenRouterModelsHttpClient implements OpenRouterModelsClient {
  private readonly logger = new Logger(OpenRouterModelsHttpClient.name);

  async fetchModels(): Promise<UpstreamCatalog> {
    const models: UpstreamModel[] = [];
    const discarded: string[] = [];
    const fetched = new Set<string>();
    let nextUrl: string | null = OPENROUTER_MODELS_URL;
    let pages = 0;
    let complete = true;

    while (nextUrl !== null && pages < MAX_MODEL_PAGES) {
      if (fetched.has(nextUrl)) {
        // Clearing it keeps the truncation warning below meaning "hit the page
        // cap", which is a different upstream problem than a cycle.
        nextUrl = null;
        complete = false;
        this.logger.warn({
          event: 'ai.catalog.upstream_pagination_cycle',
          pages,
        });
        break;
      }
      fetched.add(nextUrl);
      const page = await this.fetchPage(nextUrl);
      pages += 1;
      for (const raw of page.data) {
        const parsed = upstreamModelSchema.safeParse(raw);
        if (parsed.success) {
          models.push(toUpstreamModel(parsed.data));
        } else {
          discarded.push(idOf(raw));
        }
      }
      nextUrl = this.nextPageUrl(page.links?.next);
    }

    if (discarded.length > 0) {
      this.logger.warn({
        event: 'ai.catalog.upstream_model_discarded',
        count: discarded.length,
        models: discarded.slice(0, DISCARD_LOG_SAMPLE_SIZE),
      });
    }
    if (nextUrl !== null) {
      complete = false;
      this.logger.warn({
        event: 'ai.catalog.upstream_pagination_truncated',
        pages,
        models: models.length,
      });
    }
    return { models, complete, discarded };
  }

  private nextPageUrl(next: string | null | undefined): string | null {
    if (!next) {
      return null;
    }
    const url = resolveUrl(next, OPENROUTER_MODELS_URL);
    if (url === null || url.origin !== OPENROUTER_ORIGIN) {
      this.logger.warn({
        event: 'ai.catalog.upstream_pagination_rejected',
        next,
      });
      return null;
    }
    return url.toString();
  }

  private async fetchPage(url: string) {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(
        `OpenRouter models request failed: HTTP ${response.status}`
      );
    }
    return modelsPageSchema.parse(await response.json());
  }
}
