import { randomBytes } from 'node:crypto';

import {
  HttpStatus,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from 'vitest';

import { EMAIL_NOT_VERIFIED_CODE } from '@knowtis/shared-types';

import {
  IDENTITY_STATE,
  policyFor,
  type IdentityState,
} from '../../../../test-support/verified-identity';
import {
  PROVIDER_LISTING_KIND,
  type ProviderListing,
} from '../../domain/ports/provider-models.port';
import {
  decryptSecret,
  encryptSecret,
} from '../../infrastructure/crypto/secret-cipher';
import { LISTING_TIMEOUT_MESSAGE } from '../../infrastructure/providers/listing/listing-http';
import { SNAPSHOT_DATE } from '../../testing/snapshot-index';
import { ByokService } from './byok.service';

const masterKeyB64 = randomBytes(32).toString('base64');
const masterKey = Buffer.from(masterKeyB64, 'base64');

const ANTHROPIC_KEY = 'sk-ant-supersecret-12345';
const OPENAI_KEY = 'sk-proj-ABCDEF1234567890';
const LISTED_MODEL_IDS = ['claude-haiku-4-5-20251001'];
const KEY_WRITE_DELAY_MS = 1_500;
const STORE_FAILURE = 'connection terminated unexpectedly';

const LISTED: ProviderListing = {
  kind: PROVIDER_LISTING_KIND.LISTED,
  modelIds: LISTED_MODEL_IDS,
};
const REJECTED: ProviderListing = {
  kind: PROVIDER_LISTING_KIND.REJECTED,
  error: 'HTTP 401: invalid x-api-key',
};
const UNAVAILABLE: ProviderListing = {
  kind: PROVIDER_LISTING_KIND.UNAVAILABLE,
  error: 'HTTP 529: Overloaded',
};

const fingerprintOf = (apiKey: string) => `fp:${apiKey.length}`;

interface MakeOverrides {
  identity?: IdentityState;
  listing?: ProviderListing;
  repo?: Partial<Record<string, ReturnType<typeof vi.fn>>>;
  models?: Partial<Record<string, ReturnType<typeof vi.fn>>>;
}

function makeService(overrides: MakeOverrides = {}) {
  const store = new Map<string, unknown>();
  const repo = {
    listForUser: vi.fn().mockResolvedValue([]),
    getEnabledProviders: vi.fn().mockResolvedValue([]),
    getEncrypted: vi.fn().mockResolvedValue(null),
    listEncrypted: vi.fn().mockResolvedValue([]),
    upsert: vi.fn(
      async (_u: string, _p: string, secret: unknown, prefix: string) => {
        store.set('secret', secret);
        store.set('prefix', prefix);
      }
    ),
    remove: vi.fn(),
    touchLastUsed: vi.fn(),
    ...overrides.repo,
  };
  const config = {
    get: (k: string) =>
      k === 'BYOK_ENCRYPTION_KEY' ? masterKeyB64 : undefined,
  };
  const settings = {
    clearBoundToUnheldProvider: vi.fn().mockResolvedValue(undefined),
  };
  const lister = {
    list: vi.fn().mockResolvedValue(overrides.listing ?? LISTED),
  };
  const models = {
    save: vi.fn().mockResolvedValue(undefined),
    ...overrides.models,
  };
  const fingerprints = { hash: fingerprintOf };
  const service = new ByokService(
    repo as never,
    config as never,
    policyFor(overrides.identity ?? IDENTITY_STATE.VERIFIED),
    settings as never,
    lister,
    models as never,
    fingerprints
  );
  return { service, repo, store, lister, models, settings };
}

const loggedWarnings = (warn: MockInstance<Logger['warn']>) =>
  warn.mock.calls.map((call) => call[0]);

describe('ByokService', () => {
  let warn: MockInstance<Logger['warn']>;

  afterEach(() => {
    warn.mockRestore();
    vi.useRealTimers();
  });

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SNAPSHOT_DATE);
    vi.clearAllMocks();
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  it('encrypts on setKey and stores a masked prefix', async () => {
    const { service, store } = makeService();
    await service.setKey('u1', 'anthropic', ANTHROPIC_KEY);
    expect(store.get('prefix')).toBe('sk-ant-s');
    expect(decryptSecret(store.get('secret') as never, masterKey)).toBe(
      ANTHROPIC_KEY
    );
  });

  it("lists the key and stores its listing with the key's fingerprint", async () => {
    const { service, lister, repo, models } = makeService();

    await service.setKey('u1', 'anthropic', ANTHROPIC_KEY);

    expect(lister.list.mock.calls).toEqual([['anthropic', ANTHROPIC_KEY]]);
    expect(models.save.mock.calls).toEqual([
      [
        'u1',
        {
          provider: 'anthropic',
          keyFingerprint: fingerprintOf(ANTHROPIC_KEY),
          modelIds: LISTED_MODEL_IDS,
          syncedAt: SNAPSHOT_DATE,
        },
      ],
    ]);
    expect(repo.upsert.mock.invocationCallOrder[0]).toBeLessThan(
      models.save.mock.invocationCallOrder[0] ?? 0
    );
  });

  it('stamps the listing no earlier than the key it describes was stored', async () => {
    const keyWrittenAt = new Date(SNAPSHOT_DATE.getTime() + KEY_WRITE_DELAY_MS);
    const { service, models } = makeService({
      repo: {
        upsert: vi.fn(async () => {
          vi.setSystemTime(keyWrittenAt);
        }),
      },
    });

    await service.setKey('u1', 'anthropic', ANTHROPIC_KEY);

    const syncedAt: Date = models.save.mock.calls[0]?.[1]?.syncedAt;
    expect(syncedAt.getTime()).toBeGreaterThanOrEqual(keyWrittenAt.getTime());
  });

  it('rejects a key the provider refused with 422 and stores nothing', async () => {
    const { service, repo, models, settings } = makeService({
      listing: REJECTED,
    });

    const failure = await service
      .setKey('u1', 'openai', OPENAI_KEY)
      .catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(UnprocessableEntityException);
    expect((failure as Error).message).toBe(
      'The openai key was rejected. Check that it is valid.'
    );
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(models.save).not.toHaveBeenCalled();
    expect(settings.clearBoundToUnheldProvider).not.toHaveBeenCalled();
  });

  it('answers 503 when the provider cannot be reached and stores nothing', async () => {
    const { service, repo, models, settings } = makeService({
      listing: UNAVAILABLE,
    });

    const failure = await service
      .setKey('u1', 'openai', OPENAI_KEY)
      .catch((e: unknown) => e);

    expect(failure).toBeInstanceOf(ServiceUnavailableException);
    expect((failure as Error).message).toBe(
      'openai could not be reached to check the key. Try again in a moment.'
    );
    expect(repo.upsert).not.toHaveBeenCalled();
    expect(models.save).not.toHaveBeenCalled();
    expect(settings.clearBoundToUnheldProvider).not.toHaveBeenCalled();
  });

  it('accepts a key whose listing proves it valid even without credit', async () => {
    const { service, repo } = makeService({
      listing: { kind: PROVIDER_LISTING_KIND.LISTED, modelIds: ['gpt-6-luna'] },
    });

    await expect(
      service.setKey('u1', 'openai', OPENAI_KEY)
    ).resolves.toBeUndefined();

    expect(repo.upsert).toHaveBeenCalledWith(
      'u1',
      'openai',
      expect.anything(),
      'sk-proj-'
    );
  });

  it('stores the key without a listing when the listing is incomplete', async () => {
    const { service, repo, models } = makeService({
      listing: { kind: PROVIDER_LISTING_KIND.LISTED, modelIds: null },
    });

    await service.setKey('u1', 'openai', OPENAI_KEY);

    expect(repo.upsert).toHaveBeenCalledTimes(1);
    expect(models.save).not.toHaveBeenCalled();
    expect(loggedWarnings(warn)).toEqual([
      { event: 'byok.listing_incomplete', userId: 'u1', provider: 'openai' },
    ]);
  });

  it('keeps the saved key when its listing cannot be stored', async () => {
    const { service, repo } = makeService({
      models: { save: vi.fn().mockRejectedValue(new Error(STORE_FAILURE)) },
    });

    await expect(
      service.setKey('u1', 'anthropic', ANTHROPIC_KEY)
    ).resolves.toBeUndefined();

    expect(repo.upsert).toHaveBeenCalledTimes(1);
    expect(loggedWarnings(warn)).toEqual([
      {
        event: 'byok.listing_store_failed',
        userId: 'u1',
        provider: 'anthropic',
        error: STORE_FAILURE,
      },
    ]);
  });

  it.each([
    ['a rejection', REJECTED],
    ['an unavailable provider', UNAVAILABLE],
    [
      'a listing that timed out',
      {
        kind: PROVIDER_LISTING_KIND.UNAVAILABLE,
        error: LISTING_TIMEOUT_MESSAGE,
      } as const,
    ],
  ])(
    'logs the provider, kind and the listing error of %s',
    async (_case, listing) => {
      const { service } = makeService({ listing });

      await service.setKey('u1', 'openai', OPENAI_KEY).catch(() => null);

      expect(loggedWarnings(warn)).toEqual([
        {
          event: 'byok.validation_failed',
          userId: 'u1',
          provider: 'openai',
          reason: listing.kind,
          error: listing.error,
        },
      ]);
    }
  );

  it('throws 503 when no master key is configured', async () => {
    const { service, lister } = makeService();
    (service as never as { masterKey: Buffer | null }).masterKey = null;
    await expect(
      service.setKey('u1', 'anthropic', 'sk-ant')
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(lister.list).not.toHaveBeenCalled();
  });

  it('enabledProviders is empty when anonymous', async () => {
    const { service } = makeService();
    expect((await service.enabledProviders('u1', true)).size).toBe(0);
  });

  it('enabledProviders lists the stored providers for a registered user', async () => {
    const { service } = makeService({
      repo: { getEnabledProviders: vi.fn().mockResolvedValue(['openai']) },
    });
    expect([...(await service.enabledProviders('u1'))]).toEqual(['openai']);
  });

  it('resolveKey finds and decrypts a stored key', async () => {
    const { service } = makeService({
      repo: {
        getEncrypted: vi.fn().mockResolvedValue({
          ...encryptSecret('sk-live', masterKey),
          keyPrefix: 'sk-live',
        }),
      },
    });
    expect(await service.resolveKey('u1', 'anthropic')).toEqual({
      kind: 'found',
      apiKey: 'sk-live',
    });
  });

  it('resolveKey reports a key that no longer decrypts', async () => {
    const { service } = makeService({
      repo: {
        getEncrypted: vi.fn().mockResolvedValue({
          ciphertext: 'bad',
          iv: 'x',
          authTag: 'y',
          keyPrefix: 'p',
        }),
      },
    });
    expect(await service.resolveKey('u1', 'anthropic')).toEqual({
      kind: 'undecryptable',
    });
  });

  it('resolveKey reports a key deleted since the tier was resolved', async () => {
    const { service } = makeService({
      repo: { getEncrypted: vi.fn().mockResolvedValue(null) },
    });
    expect(await service.resolveKey('u1', 'anthropic')).toEqual({
      kind: 'missing',
    });
  });

  describe('keyFingerprints', () => {
    const storedKey = (provider: string, apiKey: string) => ({
      provider,
      ...encryptSecret(apiKey, masterKey),
      keyPrefix: 'sk-',
    });
    const UNDECRYPTABLE_KEY = {
      provider: 'openai',
      ciphertext: 'bad',
      iv: 'x',
      authTag: 'y',
      keyPrefix: 'p',
    };

    it('fingerprints every stored key that decrypts', async () => {
      const { service, repo } = makeService({
        repo: {
          listEncrypted: vi
            .fn()
            .mockResolvedValue([
              storedKey('anthropic', ANTHROPIC_KEY),
              storedKey('openai', OPENAI_KEY),
            ]),
        },
      });

      expect(await service.keyFingerprints('u1')).toEqual(
        new Map([
          ['anthropic', fingerprintOf(ANTHROPIC_KEY)],
          ['openai', fingerprintOf(OPENAI_KEY)],
        ])
      );
      expect(repo.listEncrypted.mock.calls).toEqual([['u1']]);
      expect(repo.getEncrypted).not.toHaveBeenCalled();
    });

    it('omits a key that no longer decrypts', async () => {
      const error = vi
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);
      const { service } = makeService({
        repo: {
          listEncrypted: vi
            .fn()
            .mockResolvedValue([
              storedKey('anthropic', ANTHROPIC_KEY),
              UNDECRYPTABLE_KEY,
            ]),
        },
      });

      expect(await service.keyFingerprints('u1')).toEqual(
        new Map([['anthropic', fingerprintOf(ANTHROPIC_KEY)]])
      );
      expect(error.mock.calls.map((call) => call[0])).toEqual([
        expect.objectContaining({
          event: 'byok.decrypt_failed',
          userId: 'u1',
          provider: 'openai',
        }),
      ]);
      error.mockRestore();
    });

    it('fingerprints nothing without a master key', async () => {
      const { service, repo } = makeService({
        repo: {
          listEncrypted: vi
            .fn()
            .mockResolvedValue([storedKey('anthropic', ANTHROPIC_KEY)]),
        },
      });
      (service as never as { masterKey: Buffer | null }).masterKey = null;

      expect((await service.keyFingerprints('u1')).size).toBe(0);
      expect(repo.listEncrypted).not.toHaveBeenCalled();
    });
  });

  describe('verified email gate', () => {
    it('refuses an unverified user with EMAIL_NOT_VERIFIED and stores nothing', async () => {
      const { service, repo, lister } = makeService({
        identity: IDENTITY_STATE.UNVERIFIED,
      });

      await expect(
        service.setKey('u1', 'anthropic', ANTHROPIC_KEY)
      ).rejects.toMatchObject({
        status: HttpStatus.FORBIDDEN,
        response: { code: EMAIL_NOT_VERIFIED_CODE },
      });
      expect(lister.list).not.toHaveBeenCalled();
      expect(repo.upsert).not.toHaveBeenCalled();
    });

    it('stores a key for a verified user', async () => {
      const { service, repo, store } = makeService({
        identity: IDENTITY_STATE.VERIFIED,
      });

      await service.setKey('u1', 'anthropic', ANTHROPIC_KEY);

      expect(repo.upsert).toHaveBeenCalledWith(
        'u1',
        'anthropic',
        expect.anything(),
        'sk-ant-s'
      );
      expect(decryptSecret(store.get('secret') as never, masterKey)).toBe(
        ANTHROPIC_KEY
      );
    });
  });

  describe('deleteKey', () => {
    it('removes the key, then clears the settings bound to it only while no key is stored', async () => {
      const { service, repo, settings } = makeService();

      await service.deleteKey('u1', 'openai');

      expect(repo.remove).toHaveBeenCalledWith('u1', 'openai');
      expect(settings.clearBoundToUnheldProvider.mock.calls).toEqual([
        ['u1', 'openai'],
      ]);
      expect(repo.remove.mock.invocationCallOrder[0]).toBeLessThan(
        settings.clearBoundToUnheldProvider.mock.invocationCallOrder[0] ?? 0
      );
    });
  });

  describe('setKey and the settings bound to its provider', () => {
    it('clears the settings bound to an unheld provider before storing its key', async () => {
      const { service, repo, settings } = makeService();

      await service.setKey('u1', 'openai', OPENAI_KEY);

      expect(settings.clearBoundToUnheldProvider.mock.calls).toEqual([
        ['u1', 'openai'],
      ]);
      expect(
        settings.clearBoundToUnheldProvider.mock.invocationCallOrder[0]
      ).toBeLessThan(repo.upsert.mock.invocationCallOrder[0] ?? 0);
    });
  });
});
