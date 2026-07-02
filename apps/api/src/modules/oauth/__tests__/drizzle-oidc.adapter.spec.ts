import { ConfigModule } from '@nestjs/config';
import { Test, type TestingModule } from '@nestjs/testing';
import { config as loadEnv } from 'dotenv';
import { inArray } from 'drizzle-orm';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import { validateEnv } from '../../../config/env.config';
import {
  DATABASE_CONNECTION,
  DatabaseModule,
  oauthPayloads,
  type Database,
} from '../../../database';
import {
  createAdapterFactory,
  DrizzleOidcAdapter,
  findGrantIdsByAccountAndClient,
  grantBelongsToAccount,
  listGrantsByAccount,
} from '../drizzle-oidc.adapter';

loadEnv({ path: ['.env.local', '.env'] });
const DB_AVAILABLE = !!process.env['DATABASE_URL']?.trim();

const MODELS = [
  'AccessToken',
  'RefreshToken',
  'Session',
  'DeviceCode',
  'Grant',
];

describe.runIf(DB_AVAILABLE)('DrizzleOidcAdapter', () => {
  let moduleRef: TestingModule;
  let db: Database;
  let factory: (model: string) => DrizzleOidcAdapter;

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
    factory = createAdapterFactory(db);
  });

  beforeEach(async () => {
    await db.delete(oauthPayloads).where(inArray(oauthPayloads.model, MODELS));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  afterAll(async () => {
    await db.delete(oauthPayloads).where(inArray(oauthPayloads.model, MODELS));
    await moduleRef.close();
  });

  it('should round-trip upsert/find and honor expiration', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-07-02T12:00:00.000Z'));

    const adapter = factory('AccessToken');
    await adapter.upsert('at-1', { accountId: 'acc-1', scope: 'openid' }, 1);

    const found = await adapter.find('at-1');
    expect(found).toMatchObject({ accountId: 'acc-1', scope: 'openid' });

    vi.setSystemTime(new Date('2026-07-02T12:00:02.000Z'));
    expect(await adapter.find('at-1')).toBeUndefined();
  });

  it('should store a permanent row when expiresIn is omitted', async () => {
    const adapter = factory('Grant');
    await adapter.upsert('grant-perm', { accountId: 'acc-1' });

    const [row] = await db
      .select()
      .from(oauthPayloads)
      .where(inArray(oauthPayloads.id, ['grant-perm']));
    expect(row.expiresAt).toBeNull();
    await expect(adapter.find('grant-perm')).resolves.toMatchObject({
      accountId: 'acc-1',
    });
  });

  it('should treat expiresIn of zero as already expired, not permanent', async () => {
    const adapter = factory('AccessToken');
    await adapter.upsert('at-zero', { accountId: 'acc-1' }, 0);

    const [row] = await db
      .select()
      .from(oauthPayloads)
      .where(inArray(oauthPayloads.id, ['at-zero']));
    expect(row.expiresAt).not.toBeNull();
    await expect(adapter.find('at-zero')).resolves.toBeUndefined();
  });

  it('should replace the payload for an existing (model,id) on upsert', async () => {
    const adapter = factory('AccessToken');
    await adapter.upsert('at-2', { scope: 'openid' }, 3600);
    await adapter.upsert('at-2', { scope: 'openid profile' }, 3600);

    const found = await adapter.find('at-2');
    expect(found).toMatchObject({ scope: 'openid profile' });
  });

  it('should mark consumed and expose payload.consumed epoch on find', async () => {
    const adapter = factory('RefreshToken');
    await adapter.upsert('rt-1', { grantId: 'g-1', accountId: 'acc-1' }, 3600);

    expect((await adapter.find('rt-1'))?.['consumed']).toBeUndefined();

    await adapter.consume('rt-1');

    const found = await adapter.find('rt-1');
    expect(found).toMatchObject({ grantId: 'g-1', accountId: 'acc-1' });
    expect(found?.['consumed']).toBeTypeOf('number');
    expect(found?.['consumed'] as number).toBeGreaterThan(0);
  });

  it('should destroy by id and revoke all rows sharing a grantId across models', async () => {
    const accessTokens = factory('AccessToken');
    const refreshTokens = factory('RefreshToken');

    await accessTokens.upsert('at-a', { grantId: 'grant-1' }, 3600);
    await refreshTokens.upsert('rt-a', { grantId: 'grant-1' }, 3600);
    await accessTokens.upsert('at-b', { grantId: 'grant-2' }, 3600);

    await accessTokens.destroy('at-a');
    expect(await accessTokens.find('at-a')).toBeUndefined();
    expect(await refreshTokens.find('rt-a')).toMatchObject({
      grantId: 'grant-1',
    });

    await accessTokens.revokeByGrantId('grant-1');
    expect(await refreshTokens.find('rt-a')).toBeUndefined();
    expect(await accessTokens.find('at-b')).toMatchObject({
      grantId: 'grant-2',
    });
  });

  it('should find grant ids by account and client from the payload', async () => {
    const grants = factory('Grant');
    await grants.upsert(
      'g-ac-1',
      { accountId: 'acc-1', clientId: 'client-a' },
      3600
    );
    await grants.upsert(
      'g-ac-2',
      { accountId: 'acc-1', clientId: 'client-a' },
      3600
    );
    await grants.upsert(
      'g-other',
      { accountId: 'acc-1', clientId: 'client-b' },
      3600
    );

    const ids = await findGrantIdsByAccountAndClient(db, 'acc-1', 'client-a');

    expect(ids.sort()).toEqual(['g-ac-1', 'g-ac-2']);
    expect(
      await findGrantIdsByAccountAndClient(db, 'acc-2', 'client-a')
    ).toEqual([]);
  });

  it('should list only the account-owned grants with their full payload', async () => {
    const grants = factory('Grant');
    await grants.upsert(
      'g-mine-1',
      { accountId: 'acc-1', clientId: 'client-a', iat: 1_700_000_000 },
      3600
    );
    await grants.upsert(
      'g-mine-2',
      { accountId: 'acc-1', clientId: 'client-b' },
      3600
    );
    await grants.upsert('g-other', { accountId: 'acc-2', clientId: 'client-a' }, 3600);

    const rows = await listGrantsByAccount(db, 'acc-1');

    expect(rows.map((row) => row.id).sort()).toEqual(['g-mine-1', 'g-mine-2']);
    const mine1 = rows.find((row) => row.id === 'g-mine-1');
    expect(mine1?.payload).toMatchObject({
      accountId: 'acc-1',
      clientId: 'client-a',
      iat: 1_700_000_000,
    });
    expect(await listGrantsByAccount(db, 'acc-3')).toEqual([]);
  });

  it('should confirm grant ownership only for the owning account', async () => {
    const grants = factory('Grant');
    await grants.upsert('g-own', { accountId: 'acc-1', clientId: 'client-a' }, 3600);

    expect(await grantBelongsToAccount(db, 'g-own', 'acc-1')).toBe(true);
    expect(await grantBelongsToAccount(db, 'g-own', 'acc-2')).toBe(false);
    expect(await grantBelongsToAccount(db, 'g-missing', 'acc-1')).toBe(false);
  });

  it('should find by uid and by userCode', async () => {
    const sessions = factory('Session');
    await sessions.upsert('sess-1', { uid: 'uid-1', accountId: 'acc-1' }, 3600);
    expect(await sessions.findByUid('uid-1')).toMatchObject({
      accountId: 'acc-1',
    });
    expect(await sessions.findByUid('missing')).toBeUndefined();

    const deviceCodes = factory('DeviceCode');
    await deviceCodes.upsert(
      'dc-1',
      { userCode: 'WDJB-MJHT', accountId: 'acc-1' },
      3600
    );
    expect(await deviceCodes.findByUserCode('WDJB-MJHT')).toMatchObject({
      accountId: 'acc-1',
    });
    expect(await deviceCodes.findByUserCode('missing')).toBeUndefined();
  });
});
