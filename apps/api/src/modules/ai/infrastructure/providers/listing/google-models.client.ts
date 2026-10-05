import { HttpStatus } from '@nestjs/common';
import { z } from 'zod';

import type { ProviderListing } from '../../../domain/ports/provider-models.port';
import { GEMINI_BAD_KEY_REASON } from '../byok-key-failure';
import {
  getListingJson,
  isAuthRefusal,
  paginatedListing,
  type ListingPage,
  type ListingRefusal,
  type ProviderModelsClient,
} from './listing-http';

const GOOGLE_MODELS_URL =
  'https://generativelanguage.googleapis.com/v1beta/models';
/** Gemini names a base model `models/<id>`; tuned models live under another collection. */
export const GOOGLE_MODEL_PREFIX = 'models/';
const GOOGLE_PAGE_SIZE = 1000;

// Protobuf JSON omits an empty repeated field, so an empty listing is `{}`.
const googlePage = z.object({
  models: z.array(z.unknown()).optional(),
  nextPageToken: z.string().optional(),
});
const modelEntry = z.object({ name: z.string() });
const errorDetails = z.object({
  error: z.object({ details: z.array(z.unknown()) }),
});
const detailReason = z.object({ reason: z.string() });

function pageUrl(pageToken: string | null): URL {
  const url = new URL(GOOGLE_MODELS_URL);
  url.searchParams.set('pageSize', String(GOOGLE_PAGE_SIZE));
  if (pageToken !== null) {
    url.searchParams.set('pageToken', pageToken);
  }
  return url;
}

function baseModelIds(entries: readonly unknown[]): string[] {
  return entries.flatMap((entry) => {
    const parsed = modelEntry.safeParse(entry);
    return parsed.success && parsed.data.name.startsWith(GOOGLE_MODEL_PREFIX)
      ? [parsed.data.name.slice(GOOGLE_MODEL_PREFIX.length)]
      : [];
  });
}

function parsePage(body: unknown): ListingPage | null {
  const parsed = googlePage.safeParse(body);
  if (!parsed.success) {
    return null;
  }
  return {
    ids: baseModelIds(parsed.data.models ?? []),
    next: parsed.data.nextPageToken || null,
  };
}

function isGoogleKeyRefusal(response: ListingRefusal): boolean {
  if (isAuthRefusal(response)) {
    return true;
  }
  if (response.status !== HttpStatus.BAD_REQUEST) {
    return false;
  }
  const parsed = errorDetails.safeParse(response.body);
  return (
    parsed.success &&
    parsed.data.error.details.some(
      (detail) =>
        detailReason.safeParse(detail).data?.reason === GEMINI_BAD_KEY_REASON
    )
  );
}

/** Lists what a Gemini key can call: `GET /v1beta/models`, following `nextPageToken`, with the key in a header so it never lands in a URL. */
export class GoogleModelsClient implements ProviderModelsClient {
  list(
    apiKey: string,
    signal: AbortSignal,
    keyAccepted: () => void
  ): Promise<ProviderListing> {
    const headers = { 'x-goog-api-key': apiKey };
    return paginatedListing(
      (pageToken) => getListingJson(pageUrl(pageToken), headers, signal),
      parsePage,
      keyAccepted,
      isGoogleKeyRefusal
    );
  }
}
