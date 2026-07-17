import type { AIProvider, EncryptedSecret } from '@knowtis/shared-types';

export interface SystemProviderKeyRow {
  readonly provider: AIProvider;
  readonly enabled: boolean;
  /** Null when the row only carries enablement and the env supplies the key. */
  readonly secret: EncryptedSecret | null;
  readonly keyPrefix: string | null;
  readonly updatedAt: Date;
}

export interface SystemProviderKeysRepository {
  getAll(): Promise<SystemProviderKeyRow[]>;
  setKey(
    provider: AIProvider,
    secret: EncryptedSecret,
    keyPrefix: string,
    actorId: string
  ): Promise<void>;
  setEnabled(
    provider: AIProvider,
    enabled: boolean,
    actorId: string
  ): Promise<void>;
  /** Clears the stored key, leaving enablement intact so the env key takes over. False when no row existed. */
  clearKey(provider: AIProvider, actorId: string): Promise<boolean>;
}

export const SYSTEM_PROVIDER_KEYS_REPOSITORY = Symbol(
  'SYSTEM_PROVIDER_KEYS_REPOSITORY'
);
