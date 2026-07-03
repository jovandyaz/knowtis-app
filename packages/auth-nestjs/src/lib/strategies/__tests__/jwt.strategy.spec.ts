import { USER_ROLE } from '@jovandyaz/auth/server';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import type { AuthModuleOptions } from '../../auth.module';
import type { UserEntity, UserRepository } from '../../ports/user.repository';
import { JwtStrategy } from '../jwt.strategy';

const ACCESS_SECRET = 'test-access-token-secret';
const USER_ID = 'user-1';

const USER: UserEntity = {
  id: USER_ID,
  email: 'user@test.com',
  name: 'Test User',
  avatarUrl: null,
  passwordHash: null,
  emailVerifiedAt: new Date(),
  role: USER_ROLE.USER,
  createdAt: new Date(),
  updatedAt: new Date(),
};

interface AuthOutcome {
  type: 'success' | 'fail' | 'error';
  user?: unknown;
  info?: unknown;
  error?: unknown;
}

function buildStrategy(additionalPublicKeys: string[]): JwtStrategy {
  const userRepository = {
    findById: vi.fn().mockResolvedValue(USER),
  } as unknown as UserRepository;

  const options = {
    tokenConfig: {
      accessTokenSecret: ACCESS_SECRET,
      refreshTokenSecret: 'test-refresh-secret',
      additionalPublicKeys,
    },
  } as unknown as AuthModuleOptions;

  return new JwtStrategy(options, userRepository);
}

function runStrategy(
  strategy: JwtStrategy,
  token: string
): Promise<AuthOutcome> {
  return new Promise((resolve) => {
    const request = { headers: { authorization: `Bearer ${token}` } };
    Object.assign(strategy, {
      success: (user: unknown) => resolve({ type: 'success', user }),
      fail: (info: unknown) => resolve({ type: 'fail', info }),
      error: (error: unknown) => resolve({ type: 'error', error }),
      pass: () => resolve({ type: 'fail', info: 'pass' }),
      redirect: () => resolve({ type: 'fail', info: 'redirect' }),
    });
    (
      strategy as unknown as { authenticate: (req: unknown) => void }
    ).authenticate(request);
  });
}

function signHs256(secret: string = ACCESS_SECRET): Promise<string> {
  return new SignJWT({ email: USER.email })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(USER_ID)
    .setExpirationTime('15m')
    .sign(new TextEncoder().encode(secret));
}

function unsignedToken(): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 900;
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode({ sub: USER_ID, exp })}.`;
}

describe('JwtStrategy', () => {
  let es256Pem: string;
  let es256Token: string;
  let unknownKeyToken: string;

  beforeAll(async () => {
    const asKeyPair = await generateKeyPair('ES256', { extractable: true });
    es256Pem = await exportSPKI(asKeyPair.publicKey);
    es256Token = await new SignJWT({
      email: USER.email,
      source: 'mcp',
      scopes: 'notes:read,notes:write',
    })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject(USER_ID)
      .setExpirationTime('15m')
      .sign(asKeyPair.privateKey);

    const otherKeyPair = await generateKeyPair('ES256', { extractable: true });
    unknownKeyToken = await new SignJWT({ email: USER.email, source: 'mcp' })
      .setProtectedHeader({ alg: 'ES256' })
      .setSubject(USER_ID)
      .setExpirationTime('15m')
      .sign(otherKeyPair.privateKey);
  });

  it('should validate HS256 session tokens (existing behavior)', async () => {
    const strategy = buildStrategy([]);
    const token = await signHs256();

    const outcome = await runStrategy(strategy, token);

    expect(outcome.type).toBe('success');
    expect(outcome.user).toMatchObject({ id: USER_ID, email: USER.email });
  });

  it('should validate ES256 tokens against additionalPublicKeys', async () => {
    const strategy = buildStrategy([es256Pem]);

    const outcome = await runStrategy(strategy, es256Token);

    expect(outcome.type).toBe('success');
    expect(outcome.user).toMatchObject({ id: USER_ID, email: USER.email });
  });

  it('should reject ES256 tokens from unknown keys', async () => {
    const strategy = buildStrategy([es256Pem]);

    const outcome = await runStrategy(strategy, unknownKeyToken);

    expect(outcome.type).toBe('fail');
  });

  it('should reject ES256 tokens when no public keys are configured', async () => {
    const strategy = buildStrategy([]);

    const outcome = await runStrategy(strategy, es256Token);

    expect(outcome.type).toBe('fail');
  });

  it('should reject HS256 tokens signed with the ES256 public key as HMAC secret', async () => {
    const strategy = buildStrategy([es256Pem]);
    const confusedToken = await signHs256(es256Pem);

    const outcome = await runStrategy(strategy, confusedToken);

    expect(outcome.type).toBe('fail');
  });

  it('should reject unsigned tokens with alg none', async () => {
    const strategy = buildStrategy([es256Pem]);

    const outcome = await runStrategy(strategy, unsignedToken());

    expect(outcome.type).toBe('fail');
  });

  it('should reject tokens with a malformed header segment', async () => {
    const strategy = buildStrategy([es256Pem]);

    const outcome = await runStrategy(strategy, 'not-json-header.payload.sig');

    expect(outcome.type).toBe('fail');
  });
});
