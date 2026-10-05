import { Logger } from '@nestjs/common';
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest';

import type { ByokProvider } from '@knowtis/shared-types';

import { entitledIdsOf } from '../../domain/model-catalog/byok-entitlement';
import {
  PROVIDER_LISTING_KIND,
  type ProviderListing,
} from '../../domain/ports/provider-models.port';
import type {
  ProviderModelListing,
  UserProviderModelsRepository,
} from '../../domain/ports/user-provider-models.repository';
import { SNAPSHOT_DATE } from '../../testing/snapshot-index';
import { ByokModelsService } from './byok-models.service';
import {
  BYOK_KEY_LOOKUP,
  type ByokKeyLookup,
  type ByokService,
} from './byok.service';

const USER_ID = 'u1';
const API_KEY = 'sk-ant-supersecret-12345';
const OLD_FINGERPRINT = 'fp:old';
const LISTED_MODEL_IDS = ['claude-haiku-4-5-20251001', 'claude-sonnet-5'];
const KEY_READ_DELAY_MS = 1_500;
const FOREIGN_KEY_VIOLATION = 'insert violates user_provider_models_key_fk';
const READ_FAILURE = 'connection terminated unexpectedly';

const fingerprintOf = (apiKey: string) => `fp:${apiKey.length}`;

const STORED_ROW: ProviderModelListing = {
  provider: 'anthropic',
  keyFingerprint: OLD_FINGERPRINT,
  modelIds: ['claude-haiku-4-5-20251001'],
  syncedAt: new Date(SNAPSHOT_DATE.getTime() - KEY_READ_DELAY_MS),
};
const NEWER_ROW: ProviderModelListing = {
  ...STORED_ROW,
  keyFingerprint: 'fp:newer',
};

const LISTED: ProviderListing = {
  kind: PROVIDER_LISTING_KIND.LISTED,
  modelIds: LISTED_MODEL_IDS,
};
const FOUND: ByokKeyLookup = { kind: BYOK_KEY_LOOKUP.FOUND, apiKey: API_KEY };

interface MakeOverrides {
  rows?: (ProviderModelListing | null)[];
  key?: ByokKeyLookup;
  listing?: ProviderListing;
  written?: boolean | Error;
  markedStale?: Error;
  resolveKey?: Mock<ByokService['resolveKey']>;
  listings?: readonly ProviderModelListing[] | Error;
  keyFingerprints?: ReadonlyMap<ByokProvider, string> | Error;
}

const settle = <T>(value: T | Error) =>
  value instanceof Error
    ? vi.fn().mockRejectedValue(value)
    : vi.fn().mockResolvedValue(value);

function makeService(overrides: MakeOverrides = {}) {
  const rows = overrides.rows ?? [STORED_ROW];
  const get = vi.fn();
  for (const row of rows) {
    get.mockResolvedValueOnce(row);
  }
  const replace = vi.fn<UserProviderModelsRepository['replace']>();
  if (overrides.written instanceof Error) {
    replace.mockRejectedValue(overrides.written);
  } else {
    replace.mockResolvedValue(overrides.written ?? true);
  }
  const models = {
    get,
    markStale: settle(overrides.markedStale ?? undefined),
    save: vi.fn(),
    replace,
    findDue: vi.fn(),
    listForUser: settle(overrides.listings ?? []),
  };
  const byok = {
    resolveKey:
      overrides.resolveKey ?? vi.fn().mockResolvedValue(overrides.key ?? FOUND),
    keyFingerprints: settle(overrides.keyFingerprints ?? new Map()),
    deleteKey: vi.fn(),
  };
  const lister = {
    list: vi.fn().mockResolvedValue(overrides.listing ?? LISTED),
  };
  const service = new ByokModelsService(byok as never, lister, models, {
    hash: fingerprintOf,
  });
  return { service, models, byok, lister };
}

describe('ByokModelsService.relist', () => {
  let warn: MockInstance<Logger['warn']>;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(SNAPSHOT_DATE);
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    vi.useRealTimers();
  });

  it('re-lists the stored key and writes over the row it read', async () => {
    const { service, models, byok, lister } = makeService();

    await expect(service.relist(USER_ID, 'anthropic')).resolves.toBe('listed');

    expect(lister.list.mock.calls).toEqual([['anthropic', API_KEY]]);
    expect(models.replace.mock.calls).toEqual([
      [
        USER_ID,
        {
          provider: 'anthropic',
          keyFingerprint: fingerprintOf(API_KEY),
          modelIds: LISTED_MODEL_IDS,
          syncedAt: SNAPSHOT_DATE,
        },
        OLD_FINGERPRINT,
      ],
    ]);
    expect(models.get.mock.invocationCallOrder[0]).toBeLessThan(
      byok.resolveKey.mock.invocationCallOrder[0] ?? 0
    );
    expect(models.save).not.toHaveBeenCalled();
  });

  it('inserts the first listing of a key that had none', async () => {
    const { service, models } = makeService({ rows: [null] });

    await expect(service.relist(USER_ID, 'anthropic')).resolves.toBe('listed');

    expect(models.replace.mock.calls[0]?.[2]).toBeNull();
  });

  it('stamps the listing no later than the key it describes was read', async () => {
    const keyReadAt = new Date(SNAPSHOT_DATE.getTime() + KEY_READ_DELAY_MS);
    const { service, models } = makeService({
      resolveKey: vi.fn<ByokService['resolveKey']>(async () => {
        vi.setSystemTime(keyReadAt);
        return FOUND;
      }),
    });

    await service.relist(USER_ID, 'anthropic');

    const syncedAt: Date = models.replace.mock.calls[0]?.[1]?.syncedAt;
    expect(syncedAt.getTime()).toBeLessThan(keyReadAt.getTime());
  });

  it('reports superseded when a newer key wrote the listing first', async () => {
    const { service, models } = makeService({
      rows: [STORED_ROW, NEWER_ROW],
      written: false,
    });

    await expect(service.relist(USER_ID, 'anthropic')).resolves.toBe(
      'superseded'
    );
    expect(models.replace).toHaveBeenCalledTimes(1);
  });

  it('fails when the key is deleted while its listing is written', async () => {
    const { service } = makeService({
      rows: [STORED_ROW, null],
      written: false,
    });

    await expect(service.relist(USER_ID, 'anthropic')).rejects.toThrow(
      'The anthropic key was deleted while it was re-listed'
    );
  });

  it('lets the first listing of a key deleted meanwhile reject', async () => {
    const { service } = makeService({
      rows: [null],
      written: new Error(FOREIGN_KEY_VIOLATION),
    });

    await expect(service.relist(USER_ID, 'anthropic')).rejects.toThrow(
      FOREIGN_KEY_VIOLATION
    );
  });

  it.each([
    [
      'keeps the row when the provider now rejects the key',
      PROVIDER_LISTING_KIND.REJECTED,
      'HTTP 401: invalid x-api-key',
    ],
    [
      'keeps the row when the provider cannot be reached',
      PROVIDER_LISTING_KIND.UNAVAILABLE,
      'HTTP 529: Overloaded',
    ],
  ] as const)('%s', async (_title, kind, error) => {
    const { service, models, byok } = makeService({
      listing: { kind, error },
    });

    await expect(service.relist(USER_ID, 'anthropic')).resolves.toBe(kind);

    expect(models.replace).not.toHaveBeenCalled();
    expect(models.save).not.toHaveBeenCalled();
    expect(byok.deleteKey).not.toHaveBeenCalled();
    expect(warn.mock.calls.map((call) => call[0])).toEqual([
      {
        event: 'byok.relist_failed',
        userId: USER_ID,
        provider: 'anthropic',
        reason: kind,
        error,
      },
    ]);
  });

  it('writes nothing for an unknown list', async () => {
    const { service, models } = makeService({
      listing: { kind: PROVIDER_LISTING_KIND.LISTED, modelIds: null },
    });

    await expect(service.relist(USER_ID, 'anthropic')).resolves.toBe(
      'unlisted'
    );
    expect(models.replace).not.toHaveBeenCalled();
    expect(models.save).not.toHaveBeenCalled();
  });

  it.each([BYOK_KEY_LOOKUP.MISSING, BYOK_KEY_LOOKUP.UNDECRYPTABLE] as const)(
    'does nothing without a decryptable key (%s)',
    async (kind) => {
      const { service, models, lister } = makeService({ key: { kind } });

      await expect(service.relist(USER_ID, 'anthropic')).resolves.toBe(
        'no_key'
      );
      expect(lister.list).not.toHaveBeenCalled();
      expect(models.replace).not.toHaveBeenCalled();
    }
  );
});

describe('ByokModelsService.entitlementsFor', () => {
  let warn: MockInstance<Logger['warn']>;

  beforeEach(() => {
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  const listingOf = (
    provider: ByokProvider,
    keyFingerprint: string,
    modelIds: readonly string[]
  ): ProviderModelListing => ({
    provider,
    keyFingerprint,
    modelIds,
    syncedAt: SNAPSHOT_DATE,
  });

  it('entitles only listings of the keys held now', async () => {
    const { service, models, byok } = makeService({
      listings: [
        listingOf('anthropic', fingerprintOf(API_KEY), LISTED_MODEL_IDS),
        listingOf('openai', OLD_FINGERPRINT, ['gpt-6-luna']),
        listingOf('google', OLD_FINGERPRINT, ['gemini-3-flash']),
      ],
      keyFingerprints: new Map([
        ['anthropic', fingerprintOf(API_KEY)],
        ['openai', 'fp:replaced'],
      ]),
    });

    expect(await service.entitlementsFor(USER_ID)).toEqual(
      new Map([['anthropic', entitledIdsOf(LISTED_MODEL_IDS)]])
    );
    expect(models.listForUser.mock.calls).toEqual([[USER_ID]]);
    expect(byok.keyFingerprints.mock.calls).toEqual([[USER_ID]]);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['the listings', { listings: new Error(READ_FAILURE) }],
    ['the held keys', { keyFingerprints: new Error(READ_FAILURE) }],
  ] as const)(
    'fails open when %s cannot be read',
    async (_source, overrides) => {
      const { service } = makeService({
        listings: [listingOf('anthropic', fingerprintOf(API_KEY), ['m1'])],
        keyFingerprints: new Map([['anthropic', fingerprintOf(API_KEY)]]),
        ...overrides,
      });

      await expect(service.entitlementsFor(USER_ID)).resolves.toEqual(
        new Map()
      );
      expect(warn.mock.calls.map((call) => call[0])).toEqual([
        {
          event: 'byok.entitlement.read_failed',
          userId: USER_ID,
          error: READ_FAILURE,
        },
      ]);
    }
  );
});

describe('ByokModelsService.reportModelNotFound', () => {
  let log: MockInstance<Logger['log']>;
  let warn: MockInstance<Logger['warn']>;

  beforeEach(() => {
    log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => {
    log.mockRestore();
    warn.mockRestore();
  });

  it('marks stale before re-listing', async () => {
    const { service, models, lister } = makeService();

    await expect(
      service.reportModelNotFound(USER_ID, 'anthropic')
    ).resolves.toBeUndefined();

    expect(models.markStale.mock.calls).toEqual([[USER_ID, 'anthropic']]);
    expect(models.markStale.mock.invocationCallOrder[0]).toBeLessThan(
      models.get.mock.invocationCallOrder[0] ?? 0
    );
    expect(lister.list.mock.calls).toEqual([['anthropic', API_KEY]]);
    expect(models.replace).toHaveBeenCalledTimes(1);
    expect(log.mock.calls.map((call) => call[0])).toEqual([
      {
        event: 'byok.relist.model_not_found',
        userId: USER_ID,
        provider: 'anthropic',
        outcome: 'listed',
      },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['the stale mark', { markedStale: new Error(READ_FAILURE) }, READ_FAILURE],
    [
      'the re-list',
      { written: new Error(FOREIGN_KEY_VIOLATION) },
      FOREIGN_KEY_VIOLATION,
    ],
  ] as const)(
    'logs and resolves when %s throws',
    async (_step, overrides, reason) => {
      const { service } = makeService(overrides);

      await expect(
        service.reportModelNotFound(USER_ID, 'anthropic')
      ).resolves.toBeUndefined();

      expect(warn.mock.calls.map((call) => call[0])).toEqual([
        {
          event: 'byok.relist_failed',
          userId: USER_ID,
          provider: 'anthropic',
          error: reason,
        },
      ]);
      expect(log).not.toHaveBeenCalled();
      expect(JSON.stringify(warn.mock.calls)).not.toContain(API_KEY);
    }
  );
});
