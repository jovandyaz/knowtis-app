import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import {
  enrichmentFromModelsDev,
  fromModelsDev,
  MODELS_DEV_PROVIDERS,
  type IndexedModel,
  type ModelsDevEnrichment,
} from '@knowtis/ai-gateway';

import {
  DISCARD_LOG_SAMPLE_SIZE,
  upstreamIdOf,
} from '../../domain/model-catalog/upstream-discards';
import type {
  ModelsDevCatalog,
  ModelsDevClient,
} from '../../domain/ports/models-dev.port';

export const MODELS_DEV_URL = 'https://models.dev/api.json';

const REQUEST_TIMEOUT_MS = 15_000;
/** Ceiling for the third-party payload, roughly three times the size it publishes today. */
export const MAX_BODY_BYTES = 16 * 1024 * 1024;

const OPENROUTER_SECTION = 'openrouter';

const catalogPayloadSchema = z.record(z.string(), z.unknown());

const providerSectionSchema = z
  .object({ models: z.record(z.string(), z.unknown()) })
  .optional();

type CatalogPayload = z.infer<typeof catalogPayloadSchema>;
type ProviderSection = z.infer<typeof providerSectionSchema>;

function payloadTooLarge(): Error {
  return new Error(`models.dev payload exceeds ${MAX_BODY_BYTES} bytes`);
}

async function readBoundedBody(response: Response): Promise<string> {
  const declaredBytes = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_BODY_BYTES) {
    await response.body?.cancel();
    throw payloadTooLarge();
  }
  const reader = response.body?.getReader();
  if (reader === undefined) {
    throw new Error('models.dev response carried no body');
  }
  const decoder = new TextDecoder();
  let readBytes = 0;
  let body = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    readBytes += value.byteLength;
    if (readBytes > MAX_BODY_BYTES) {
      await reader.cancel();
      throw payloadTooLarge();
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

function entriesOf(section: ProviderSection): unknown[] {
  return section === undefined ? [] : Object.values(section.models);
}

@Injectable()
export class ModelsDevHttpClient implements ModelsDevClient {
  private readonly logger = new Logger(ModelsDevHttpClient.name);

  async fetchCatalog(): Promise<ModelsDevCatalog> {
    const response = await fetch(MODELS_DEV_URL, {
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      throw new Error(`models.dev request failed: HTTP ${response.status}`);
    }
    const payload = catalogPayloadSchema.parse(
      JSON.parse(await readBoundedBody(response))
    );
    const { models, discarded } = this.indexedRows(payload);
    return {
      models,
      openRouterEnrichment: this.openRouterEnrichment(payload),
      discarded,
    };
  }

  private indexedRows(payload: CatalogPayload) {
    const models: IndexedModel[] = [];
    const discarded: string[] = [];
    for (const provider of MODELS_DEV_PROVIDERS) {
      const section = providerSectionSchema.parse(payload[provider]);
      for (const entry of entriesOf(section)) {
        const model = fromModelsDev(provider, entry);
        if (model === null) {
          discarded.push(`${provider}:${upstreamIdOf(entry)}`);
        } else {
          models.push(model);
        }
      }
    }
    if (discarded.length > 0) {
      this.logger.warn({
        event: 'ai.model_index.models_dev_discarded',
        count: discarded.length,
        models: discarded.slice(0, DISCARD_LOG_SAMPLE_SIZE),
      });
    }
    return { models, discarded };
  }

  private openRouterEnrichment(
    payload: CatalogPayload
  ): Map<string, ModelsDevEnrichment> {
    const enrichment = new Map<string, ModelsDevEnrichment>();
    const section = providerSectionSchema.safeParse(
      payload[OPENROUTER_SECTION]
    );
    if (!section.success) {
      this.logger.warn({
        event: 'ai.model_index.models_dev_enrichment_unreadable',
        reason: section.error.issues
          .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
          .join('; '),
      });
      return enrichment;
    }
    const skipped: string[] = [];
    for (const entry of entriesOf(section.data)) {
      const facts = enrichmentFromModelsDev(entry);
      if (facts === null) {
        skipped.push(upstreamIdOf(entry));
      } else {
        enrichment.set(upstreamIdOf(entry), facts);
      }
    }
    if (skipped.length > 0) {
      this.logger.warn({
        event: 'ai.model_index.models_dev_enrichment_skipped',
        count: skipped.length,
        models: skipped.slice(0, DISCARD_LOG_SAMPLE_SIZE),
      });
    }
    return enrichment;
  }
}
