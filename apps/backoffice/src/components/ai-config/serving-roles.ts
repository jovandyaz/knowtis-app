import type { AiConfigEntry } from '@knowtis/data-access-admin';
import { AI_CONFIG_KEYS, parseChain } from '@knowtis/shared-types';

const INTENT_ROLE_BY_KEY = {
  [AI_CONFIG_KEYS.DEFAULT_MODEL]: 'Default',
  [AI_CONFIG_KEYS.FAST_MODEL]: 'Fast',
  [AI_CONFIG_KEYS.DEEP_MODEL]: 'Deep',
} as const;

const FALLBACK_ROLE = 'Fallback' as const;

export type ServingRole =
  | (typeof INTENT_ROLE_BY_KEY)[keyof typeof INTENT_ROLE_BY_KEY]
  | typeof FALLBACK_ROLE;

function isIntentKey(key: string): key is keyof typeof INTENT_ROLE_BY_KEY {
  return Object.hasOwn(INTENT_ROLE_BY_KEY, key);
}

/**
 * Which config keys each model id is currently serving, read from the
 * effective config so the roles reflect what actually routes. Intent roles
 * come before Fallback so the marker leads with the stronger claim.
 */
export function servingRolesFrom(
  entries: readonly AiConfigEntry[] | undefined
): ReadonlyMap<string, readonly ServingRole[]> {
  const roles = new Map<string, ServingRole[]>();
  const add = (modelId: string, role: ServingRole) => {
    const existing = roles.get(modelId) ?? [];
    if (!existing.includes(role)) {
      roles.set(modelId, [...existing, role]);
    }
  };

  for (const entry of entries ?? []) {
    if (isIntentKey(entry.key)) {
      add(entry.value, INTENT_ROLE_BY_KEY[entry.key]);
    }
  }
  const chain = entries?.find(
    (entry) => entry.key === AI_CONFIG_KEYS.FALLBACK_CHAIN
  );
  for (const member of chain ? parseChain(chain.value) : []) {
    add(member, FALLBACK_ROLE);
  }
  return roles;
}
