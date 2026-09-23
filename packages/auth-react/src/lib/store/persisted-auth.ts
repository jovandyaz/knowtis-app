import { z } from 'zod';

const persistedUserSchema = z
  .looseObject({ isAnonymous: z.boolean().optional() })
  .nullable();

const persistedAuthSchema = z.looseObject({
  state: z.looseObject({
    user: persistedUserSchema,
    isAuthenticated: z.boolean(),
  }),
});

export type PersistedUser = z.infer<typeof persistedUserSchema>;

export interface PersistedAuthSnapshot {
  user: PersistedUser;
  isAuthenticated: boolean;
}

function readStoredValue(storageKey: string): string | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  try {
    return localStorage.getItem(storageKey);
  } catch (error) {
    console.warn('[auth-react] Persisted auth unreadable', error);
    return null;
  }
}

/** Reads the persisted auth snapshot; returns null on missing key, unreadable
 * storage, malformed JSON, or shape drift (drift logs a warning so package
 * upgrades surface it). */
export function readPersistedAuth(
  storageKey: string
): PersistedAuthSnapshot | null {
  const raw = readStoredValue(storageKey);
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
    user: result.data.state.user,
    isAuthenticated: result.data.state.isAuthenticated,
  };
}
