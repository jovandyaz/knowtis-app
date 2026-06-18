import type { ByokProvider, ProviderKeyInfo } from '@knowtis/shared-types';

import type { EncryptedSecret } from '../../infrastructure/crypto/secret-cipher';

export interface StoredProviderKey extends EncryptedSecret {
  readonly keyPrefix: string;
}

export interface UserProviderKeysRepository {
  listForUser(userId: string): Promise<ProviderKeyInfo[]>;
  getEnabledProviders(userId: string): Promise<ByokProvider[]>;
  getEncrypted(
    userId: string,
    provider: ByokProvider
  ): Promise<StoredProviderKey | null>;
  upsert(
    userId: string,
    provider: ByokProvider,
    secret: EncryptedSecret,
    keyPrefix: string
  ): Promise<void>;
  remove(userId: string, provider: ByokProvider): Promise<void>;
  touchLastUsed(userId: string, provider: ByokProvider): Promise<void>;
}

export const USER_PROVIDER_KEYS_REPOSITORY = Symbol(
  'USER_PROVIDER_KEYS_REPOSITORY'
);
