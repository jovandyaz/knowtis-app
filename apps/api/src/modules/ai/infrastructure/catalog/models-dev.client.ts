import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';

import {
  enrichmentFromModelsDev,
  fromModelsDev,
  MODELS_DEV_PROVIDERS,
  type IndexedModel,
  type ModelsDevEnrichment,
} from '@knowtis/ai-gateway';

import type {
  ModelsDevCatalog,
  ModelsDevClient,
} from '../../domain/ports/models-dev.port';
import { DISCARD_LOG_SAMPLE_SIZE, upstreamIdOf } from './upstream-discards';

export const MODELS_DEV_URL = 'https://models.dev/api.json';

const REQUEST_TIMEOUT_MS = 15_000;
/** Ceiling for the third-party payload, roughly three times the size it publishes today. */
export const MAX_BODY_BYTES = 16 * 1024 * 1024;

const OPENROUTER_SECTION = 'openrouter';
const PROTOTYPE_KEY = '__proto__';

const catalogPayloadSchema = z.record(z.string(), z.unknown());

const providerSectionSchema = z.object({
  models: z.record(z.string(), z.unknown()),
});

type CatalogPayload = z.infer<typeof catalogPayloadSchema>;

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

function sectionEntries(payload: CatalogPayload, provider: string): unknown[] {
  const section = providerSectionSchema.optional().parse(payload[provider]);
  if (section === undefined) {
    return [];
  }
  return Object.entries(section.models)
    .filter(([key]) => key !== PROTOTYPE_KEY)
    .map(([, entry]) => entry);
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

    const models: IndexedModel[] = [];
    const discarded: string[] = [];
    for (const provider of MODELS_DEV_PROVIDERS) {
      for (const entry of sectionEntries(payload, provider)) {
        const model = fromModelsDev(provider, entry);
        if (model === null) {
          discarded.push(`${provider}:${upstreamIdOf(entry)}`);
        } else {
          models.push(model);
        }
      }
    }

    const openRouterEnrichment = new Map<string, ModelsDevEnrichment>();
    for (const entry of sectionEntries(payload, OPENROUTER_SECTION)) {
      const enrichment = enrichmentFromModelsDev(entry);
      if (enrichment !== null) {
        openRouterEnrichment.set(upstreamIdOf(entry), enrichment);
      }
    }

    if (discarded.length > 0) {
      this.logger.warn({
        event: 'ai.model_index.models_dev_discarded',
        count: discarded.length,
        models: discarded.slice(0, DISCARD_LOG_SAMPLE_SIZE),
      });
    }
    return { models, openRouterEnrichment, discarded };
  }
}
