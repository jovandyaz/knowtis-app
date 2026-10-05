import { BYOK_PROVIDERS, type ByokProvider } from '@knowtis/shared-types';

import { slugOf } from './catalog-model';

/** Provider → the bare ids its stored listing entitles, each dated snapshot also under its undated id. A held provider absent from the map is not filtered. */
export type ByokEntitlements = ReadonlyMap<ByokProvider, ReadonlySet<string>>;

export const NO_ENTITLEMENTS: ByokEntitlements = new Map();

export interface StoredListing {
  readonly provider: ByokProvider;
  readonly keyFingerprint: string;
  readonly modelIds: readonly string[];
}

const DATE_SUFFIX = /-(?:\d{8}|\d{4}-\d{2}-\d{2})$/;
const PROVIDER_SEPARATOR = ':';

function byokProviderOf(modelId: string): ByokProvider | null {
  const provider = modelId.slice(0, modelId.indexOf(PROVIDER_SEPARATOR));
  return BYOK_PROVIDERS.find((candidate) => candidate === provider) ?? null;
}

/** The listed ids plus each dated snapshot id under its undated id; never a prefix match. */
export function entitledIdsOf(listed: readonly string[]): ReadonlySet<string> {
  const entitled = new Set<string>();
  for (const id of listed) {
    entitled.add(id);
    entitled.add(id.replace(DATE_SUFFIX, ''));
  }
  return entitled;
}

/** A model of a provider outside BYOK, or of a held provider without a usable listing, is always entitled. */
export function isEntitled(
  modelId: string,
  entitlements: ByokEntitlements
): boolean {
  const provider = byokProviderOf(modelId);
  const entitled = provider === null ? undefined : entitlements.get(provider);
  return entitled === undefined || entitled.has(slugOf(modelId));
}

/** Only listings of the key the caller holds now; a mismatched or undecryptable key falls open. */
export function entitlementsFrom(
  listings: readonly StoredListing[],
  keyFingerprints: ReadonlyMap<ByokProvider, string>
): ByokEntitlements {
  const entitlements = new Map<ByokProvider, ReadonlySet<string>>();
  for (const listing of listings) {
    if (keyFingerprints.get(listing.provider) === listing.keyFingerprint) {
      entitlements.set(listing.provider, entitledIdsOf(listing.modelIds));
    }
  }
  return entitlements;
}
