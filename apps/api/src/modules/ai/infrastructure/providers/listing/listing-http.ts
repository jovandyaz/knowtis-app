import { HttpStatus } from '@nestjs/common';
import { z } from 'zod';

import { MODEL_ID_MAX_LENGTH } from '@knowtis/shared-types';

import { reasonOf } from '../../../../../core/errors/reason-of';
import {
  PROVIDER_LISTING_KIND,
  type ProviderListing,
} from '../../../domain/ports/provider-models.port';

/** The bound on one whole listing, every page included. */
export const LISTING_TIMEOUT_MS = 10_000;
export const MAX_LISTING_PAGES = 10;
/** The longest error a listing reports, measured after the key is redacted. */
export const LISTING_ERROR_MAX_LENGTH = 300;

const LISTING_TIMEOUT_MESSAGE = 'The listing timed out';
// Below this a "key" is too short to match anything but itself in prose.
const REDACTABLE_KEY_MIN_LENGTH = 8;
const REDACTED_KEY = '[redacted]';
// Providers echo a refused key masked ("sk-proj-****abcd"), which redacting
// the exact key cannot catch. The hyphen keeps words like "skipped" intact.
const KEY_SHAPED_FRAGMENT = /\b(?:sk-(?:proj-|or-)?|AIza)[-_A-Za-z0-9*]{4,}/g;

export interface ProviderModelsClient {
  /** Reads one provider's model list with `apiKey`, honouring `signal`, and calls `keyAccepted` once the provider has proven the key valid. May reject: `boundedListing` turns a throw into `unavailable`, or into an unknown list once `keyAccepted` was called. */
  list(
    apiKey: string,
    signal: AbortSignal,
    keyAccepted: () => void
  ): Promise<ProviderListing>;
}

export type ListingResponse =
  | { readonly ok: true; readonly body: unknown }
  | { readonly ok: false; readonly status: number; readonly body: unknown };

export type ListingRefusal = Extract<ListingResponse, { ok: false }>;

/** One page of a cursor-paginated listing: the ids it names and the next page's cursor, null on the last page. */
export interface ListingPage {
  readonly ids: readonly string[];
  readonly next: string | null;
}

const providerMessage = z.object({ error: z.object({ message: z.string() }) });
const idEntry = z.object({ id: z.string() });

/** One GET with the key in `headers`. `body` is the parsed JSON, or null when the body is not JSON; rejects only when the request itself fails, a redirect included, since following one would carry the key to wherever it points. */
export async function getListingJson(
  url: URL,
  headers: Readonly<Record<string, string>>,
  signal: AbortSignal
): Promise<ListingResponse> {
  const response = await fetch(url, { headers, signal, redirect: 'error' });
  const body: unknown = await response.json().catch(() => null);
  return response.ok
    ? { ok: true, body }
    : { ok: false, status: response.status, body };
}

/** The default key refusal: the provider refused the credential itself. */
export function isAuthRefusal(response: ListingRefusal): boolean {
  return (
    response.status === HttpStatus.UNAUTHORIZED ||
    response.status === HttpStatus.FORBIDDEN
  );
}

/** A non-2xx answer as a listing: `rejected` when `isKeyRefusal` (default 401/403), else `unavailable`, with the provider's `error.message` when it sent one. */
export function refusalOf(
  response: ListingRefusal,
  isKeyRefusal: (response: ListingRefusal) => boolean = isAuthRefusal
): ProviderListing {
  const parsed = providerMessage.safeParse(response.body);
  const error = parsed.success
    ? `HTTP ${response.status}: ${parsed.data.error.message}`
    : `HTTP ${response.status}`;
  return isKeyRefusal(response)
    ? { kind: PROVIDER_LISTING_KIND.REJECTED, error }
    : { kind: PROVIDER_LISTING_KIND.UNAVAILABLE, error };
}

/** The answer after a 2xx page: the key is valid, so any later failure only makes the list unknown. */
export const UNKNOWN_LISTING: ProviderListing = {
  kind: PROVIDER_LISTING_KIND.LISTED,
  modelIds: null,
};

const TIMED_OUT_LISTING: ProviderListing = {
  kind: PROVIDER_LISTING_KIND.UNAVAILABLE,
  error: LISTING_TIMEOUT_MESSAGE,
};

export const MALFORMED_LISTING: ProviderListing = {
  kind: PROVIDER_LISTING_KIND.UNAVAILABLE,
  error: 'The provider answered with an unexpected model list',
};

/** `ids` de-duplicated, with ids outside 1..MODEL_ID_MAX_LENGTH dropped; an empty list is unknown (Ruling 6). */
export function listedOf(ids: readonly string[]): ProviderListing {
  const routable = [
    ...new Set(
      ids.filter((id) => id.length > 0 && id.length <= MODEL_ID_MAX_LENGTH)
    ),
  ];
  return routable.length === 0
    ? UNKNOWN_LISTING
    : { kind: PROVIDER_LISTING_KIND.LISTED, modelIds: routable };
}

/** The string `id` of each entry. An entry without one is skipped, never fatal. */
export function entryIds(entries: readonly unknown[]): string[] {
  return entries.flatMap((entry) => {
    const parsed = idEntry.safeParse(entry);
    return parsed.success ? [parsed.data.id] : [];
  });
}

/**
 * Follows a cursor-paginated listing for at most MAX_LISTING_PAGES pages. The
 * first page decides the key: its non-2xx is `refusalOf`, its unreadable body
 * (`parsePage` returns null) MALFORMED_LISTING, and a readable page calls
 * `keyAccepted`. After it, a failed or unreadable page, a repeated cursor or
 * the page cap leave the list unknown.
 */
export async function paginatedListing(
  readPage: (cursor: string | null) => Promise<ListingResponse>,
  parsePage: (body: unknown) => ListingPage | null,
  keyAccepted: () => void,
  isKeyRefusal?: (response: ListingRefusal) => boolean
): Promise<ProviderListing> {
  const ids: string[] = [];
  const cursors = new Set<string>();
  let cursor: string | null = null;
  for (let read = 0; read < MAX_LISTING_PAGES; read += 1) {
    const isFirstPage = read === 0;
    const response = await readPage(cursor);
    if (!response.ok) {
      return isFirstPage ? refusalOf(response, isKeyRefusal) : UNKNOWN_LISTING;
    }
    const page = parsePage(response.body);
    if (page === null) {
      return isFirstPage ? MALFORMED_LISTING : UNKNOWN_LISTING;
    }
    keyAccepted();
    ids.push(...page.ids);
    if (page.next === null) {
      return listedOf(ids);
    }
    if (cursors.has(page.next)) {
      return UNKNOWN_LISTING;
    }
    cursors.add(page.next);
    cursor = page.next;
  }
  return UNKNOWN_LISTING;
}

/** Runs `read` under one LISTING_TIMEOUT_MS bound. A throw or the bound is `unavailable`, or lists null once `read` called `keyAccepted`; every error is redacted of `apiKey` and of anything key-shaped, then truncated. */
export async function boundedListing(
  apiKey: string,
  read: (
    signal: AbortSignal,
    keyAccepted: () => void
  ) => Promise<ProviderListing>
): Promise<ProviderListing> {
  const bound = new AbortController();
  let accepted = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // A plain timer rather than AbortSignal.timeout, so fake timers can prove a
  // hung listing settles; the race also bounds a read that ignores the signal.
  const timedOut = new Promise<ProviderListing>((resolve) => {
    timer = setTimeout(() => {
      bound.abort(new DOMException(LISTING_TIMEOUT_MESSAGE, 'TimeoutError'));
      resolve(accepted ? UNKNOWN_LISTING : TIMED_OUT_LISTING);
    }, LISTING_TIMEOUT_MS);
  });
  try {
    return scrubbedListing(
      await Promise.race([
        read(bound.signal, () => {
          accepted = true;
        }),
        timedOut,
      ]),
      apiKey
    );
  } catch (error) {
    return accepted
      ? UNKNOWN_LISTING
      : {
          kind: PROVIDER_LISTING_KIND.UNAVAILABLE,
          error: scrubbed(reasonOf(error), apiKey),
        };
  } finally {
    clearTimeout(timer);
  }
}

/** `next` resolved against `base`, or null when it is absent, unparsable or cross-origin. */
export function sameOriginNext(
  next: string | null | undefined,
  base: string
): string | null {
  if (!next) {
    return null;
  }
  try {
    const url = new URL(next, base);
    return url.origin === new URL(base).origin ? url.toString() : null;
  } catch {
    return null;
  }
}

/** Providers echo a rejected credential back in their error text, whole or masked; it must not reach a log or a response. */
function scrubbed(message: string, apiKey: string): string {
  const redacted =
    apiKey.length < REDACTABLE_KEY_MIN_LENGTH
      ? message
      : message.split(apiKey).join(REDACTED_KEY);
  return redacted
    .replace(KEY_SHAPED_FRAGMENT, REDACTED_KEY)
    .slice(0, LISTING_ERROR_MAX_LENGTH);
}

function scrubbedListing(
  listing: ProviderListing,
  apiKey: string
): ProviderListing {
  return listing.kind === PROVIDER_LISTING_KIND.LISTED
    ? listing
    : { ...listing, error: scrubbed(listing.error, apiKey) };
}
