import { randomBytes } from 'node:crypto';

import { TokenHasher } from '@jovandyaz/auth-nestjs';
import { Logger } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { and, eq } from 'drizzle-orm';
import type { Sql } from 'postgres';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
  type MockInstance,
} from 'vitest';

import type { ByokProvider } from '@knowtis/shared-types';

import { validateEnv } from '../../../../config/env.config';
import {
  DATABASE_CLIENT,
  DATABASE_CONNECTION,
  DatabaseModule,
  userProviderKeys,
  users,
  type Database,
} from '../../../../database';
import { DB_AVAILABLE } from '../../../../test-support/database';
import {
  IDENTITY_STATE,
  policyFor,
} from '../../../../test-support/verified-identity';
import { ByokModelsService } from '../../application/services/byok-models.service';
import { ByokService } from '../../application/services/byok.service';
import {
  PROVIDER_LISTING_KIND,
  type ProviderListing,
  type ProviderModelsLister,
} from '../../domain/ports/provider-models.port';
import type { UserProviderModelsRepository } from '../../domain/ports/user-provider-models.repository';
import { encryptSecret } from '../crypto/secret-cipher';
import { DrizzleUserProviderKeysRepository } from '../persistence/drizzle-user-provider-keys.repository';
import { DrizzleUserProviderModelsRepository } from '../persistence/drizzle-user-provider-models.repository';
import { ByokRelistTask } from './byok-relist.task';

const USER_ID = '00000000-0000-4000-8000-0000000000e6';
const MASTER_KEY_BYTES = 32;
const TOKEN_HASH_KEY_BYTES = 32;
const MS_PER_HOUR = 60 * 60 * 1000;
const LISTED_AGO_MS = 25 * MS_PER_HOUR;
const KEY_STORED_AGO_MS = 26 * MS_PER_HOUR;
const KEY_PREFIX_LENGTH = 8;

const ANTHROPIC_KEY = 'sk-ant-relist-db-0000000001';
const OPENAI_KEY = 'sk-proj-relist-db-000000002';
const STALE_MODEL_IDS = ['gpt-4.1'];
const STUB_MODEL_IDS = ['claude-haiku-4-5-20251001', 'gpt-5.5'];
const STUB_LISTING: ProviderListing = {
  kind: PROVIDER_LISTING_KIND.LISTED,
  modelIds: STUB_MODEL_IDS,
};

const masterKeyB64 = randomBytes(MASTER_KEY_BYTES).toString('base64');
const masterKey = Buffer.from(masterKeyB64, 'base64');

describe.runIf(DB_AVAILABLE)('ByokRelistTask (database)', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let keysRepo: DrizzleUserProviderKeysRepository;
  let modelsRepo: DrizzleUserProviderModelsRepository;
  let fingerprints: TokenHasher;
  let lister: { list: Mock<ProviderModelsLister['list']> };
  let task: ByokRelistTask;
  let relist: MockInstance<ByokModelsService['relist']>;
  let warn: MockInstance<Logger['warn']>;

  const seedKey = async (provider: ByokProvider, apiKey: string) => {
    await keysRepo.upsert(
      USER_ID,
      provider,
      encryptSecret(apiKey, masterKey),
      apiKey.slice(0, KEY_PREFIX_LENGTH)
    );
    await db
      .update(userProviderKeys)
      .set({ updatedAt: new Date(Date.now() - KEY_STORED_AGO_MS) })
      .where(
        and(
          eq(userProviderKeys.userId, USER_ID),
          eq(userProviderKeys.provider, provider)
        )
      );
  };

  // The database also holds keys of other specs and of local runs; re-listing
  // them would decrypt rows this spec never wrote under its own master key.
  const fixtureUserOnly = (
    repo: DrizzleUserProviderModelsRepository
  ): UserProviderModelsRepository => ({
    get: (userId, provider) => repo.get(userId, provider),
    save: (userId, listing) => repo.save(userId, listing),
    replace: (userId, listing, expectedFingerprint) =>
      repo.replace(userId, listing, expectedFingerprint),
    findDue: async (olderThan, limit, after) =>
      (await repo.findDue(olderThan, limit, after)).filter(
        (key) => key.userId === USER_ID
      ),
  });

  const rowsOfUser = async () => ({
    anthropic: await modelsRepo.get(USER_ID, 'anthropic'),
    openai: await modelsRepo.get(USER_ID, 'openai'),
  });

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          validate: validateEnv,
          envFilePath: ['.env.local', '.env'],
        }),
        DatabaseModule,
      ],
    }).compile();
    db = moduleRef.get<Database>(DATABASE_CONNECTION);
    keysRepo = new DrizzleUserProviderKeysRepository(db);
    modelsRepo = new DrizzleUserProviderModelsRepository(db);
    fingerprints = new TokenHasher(
      randomBytes(TOKEN_HASH_KEY_BYTES).toString('base64')
    );

    await db
      .insert(users)
      .values({
        id: USER_ID,
        email: `e-${USER_ID}@test.local`,
        name: 'T',
        isAnonymous: false,
      })
      .onConflictDoNothing();
  });

  beforeEach(async () => {
    await db
      .delete(userProviderKeys)
      .where(eq(userProviderKeys.userId, USER_ID));
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
    lister = {
      list: vi
        .fn<ProviderModelsLister['list']>()
        .mockResolvedValue(STUB_LISTING),
    };
    const config = {
      get: (key: string) =>
        key === 'BYOK_ENCRYPTION_KEY' ? masterKeyB64 : undefined,
    };
    const settings = { clearBoundToUnheldProvider: vi.fn() };
    const byok = new ByokService(
      keysRepo,
      config as never,
      policyFor(IDENTITY_STATE.VERIFIED),
      settings as never,
      lister,
      modelsRepo,
      fingerprints
    );
    const byokModels = new ByokModelsService(
      byok,
      lister,
      modelsRepo,
      fingerprints
    );
    relist = vi.spyOn(byokModels, 'relist');
    task = new ByokRelistTask(
      moduleRef.get<Sql>(DATABASE_CLIENT),
      fixtureUserOnly(modelsRepo),
      byokModels
    );
  });

  afterEach(() => {
    warn.mockRestore();
  });

  afterAll(async () => {
    await db.delete(users).where(eq(users.id, USER_ID));
    await moduleRef.close();
  });

  it('writes the listing of a key never listed and of one listed a day ago, then nothing more', async () => {
    await seedKey('anthropic', ANTHROPIC_KEY);
    await seedKey('openai', OPENAI_KEY);
    await modelsRepo.save(USER_ID, {
      provider: 'openai',
      keyFingerprint: fingerprints.hash(OPENAI_KEY),
      modelIds: STALE_MODEL_IDS,
      syncedAt: new Date(Date.now() - LISTED_AGO_MS),
    });
    const now = new Date();

    await expect(task.run(now)).resolves.toBe('completed');

    const ranUntil = Date.now();
    expect(relist.mock.calls.map(([userId]) => userId)).toEqual([
      USER_ID,
      USER_ID,
    ]);
    expect(lister.list.mock.calls).toEqual([
      ['anthropic', ANTHROPIC_KEY],
      ['openai', OPENAI_KEY],
    ]);
    const written = await rowsOfUser();
    expect(written).toEqual({
      anthropic: {
        provider: 'anthropic',
        keyFingerprint: fingerprints.hash(ANTHROPIC_KEY),
        modelIds: STUB_MODEL_IDS,
        syncedAt: expect.any(Date),
      },
      openai: {
        provider: 'openai',
        keyFingerprint: fingerprints.hash(OPENAI_KEY),
        modelIds: STUB_MODEL_IDS,
        syncedAt: expect.any(Date),
      },
    });
    for (const row of [written.anthropic, written.openai]) {
      expect(row?.syncedAt?.getTime()).toBeGreaterThanOrEqual(now.getTime());
      expect(row?.syncedAt?.getTime()).toBeLessThanOrEqual(ranUntil);
    }

    lister.list.mockClear();
    await expect(task.run(new Date())).resolves.toBe('completed');

    expect(lister.list).not.toHaveBeenCalled();
    expect(await rowsOfUser()).toEqual(written);
  });

  it('counts a key deleted while it is re-listed as failed and leaves no row', async () => {
    await seedKey('anthropic', ANTHROPIC_KEY);
    await seedKey('openai', OPENAI_KEY);
    await modelsRepo.save(USER_ID, {
      provider: 'openai',
      keyFingerprint: fingerprints.hash(OPENAI_KEY),
      modelIds: STALE_MODEL_IDS,
      syncedAt: new Date(Date.now() - LISTED_AGO_MS),
    });
    lister.list.mockImplementation(async (provider) => {
      await keysRepo.remove(USER_ID, provider);
      return STUB_LISTING;
    });

    await expect(task.run(new Date())).resolves.toBe('completed');

    expect(
      warn.mock.calls
        .map((call) => call[0])
        .filter(
          (entry: { event?: string }) =>
            entry.event === 'byok.relist.item_failed'
        )
        .map((entry: { provider: ByokProvider }) => entry.provider)
    ).toEqual(['anthropic', 'openai']);
    expect(await rowsOfUser()).toEqual({ anthropic: null, openai: null });
  });
});
