import { z } from 'zod';

import type { AuthUserProfile } from '../types';

const persistedUserSchema = z
  .looseObject({ isAnonymous: z.boolean().optional() })
  .nullable();

const persistedAuthSchema = z.looseObject({
  state: z.looseObject({
    user: persistedUserSchema,
    isAuthenticated: z.boolean(),
  }),
});

export interface PersistedAuthSnapshot {
  user: AuthUserProfile | null;
  isAuthenticated: boolean;
}

/** Reads the persisted auth snapshot; returns null on missing key, malformed
 * JSON, or shape drift (drift logs a warning so package upgrades surface it). */
export function readPersistedAuth(
  storageKey: string
): PersistedAuthSnapshot | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  const raw = localStorage.getItem(storageKey);
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = persistedAuthSchema.safeParse(parsed);
  if (!result.success) {
    console.warn(
      '[auth-react] Persisted auth schema mismatch — persist contract drifted',
      result.error.issues
    );
    return null;
  }
  return {
    user: (result.data.state.user as AuthUserProfile | null) ?? null,
    isAuthenticated: result.data.state.isAuthenticated,
  };
}
