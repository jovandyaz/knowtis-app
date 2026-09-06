import { USER_ROLE } from '@jovandyaz/auth/server';
import { UnauthorizedException } from '@nestjs/common';
import { exportSPKI, generateKeyPair, SignJWT } from 'jose';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AuthModuleOptions } from '../../auth.module';
import { JWT_AUDIENCE_ACCESS, JWT_ISSUER } from '../../constants';
import type { OauthPublicKey } from '../../oauth-public-key';
import type { SessionRepository } from '../../ports/session.repository';
import type { UserEntity, UserRepository } from '../../ports/user.repository';
import { JwtStrategy } from '../jwt.strategy';

const ACCESS_SECRET = 'test-access-token-secret';
const USER_ID = 'user-1';
const FAMILY_ID = 'family-1';

const USER: UserEntity = {
  id: USER_ID,
  email: 'user@test.com',
  name: 'Test User',
  avatarUrl: null,
  passwordHash: null,
  emailVerifiedAt: new Date(),
  locale: 'en',
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

function buildStrategy(
  additionalPublicKeys: OauthPublicKey[],
  sessionRepository?: SessionRepository
): JwtStrategy {
  const userRepository = {
    findById: vi.fn().mockResolvedValue(USER),
  } as unknown as UserRepository;

  const resolvedSessionRepository =
    sessionRepository ??
    ({
      hasLiveSessionForFamily: vi.fn().mockResolvedValue(true),
    } as unknown as SessionRepository);

  const options = {
    tokenConfig: {
      accessTokenSecret: ACCESS_SECRET,
      refreshTokenSecret: 'test-refresh-secret',
      additionalPublicKeys,
    },
  } as unknown as AuthModuleOptions;

  return new JwtStrategy(options, userRepository, resolvedSessionRepository);
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
  return new SignJWT({
    email: USER.email,
    familyId: FAMILY_ID,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE_ACCESS,
  })
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
    const strategy = buildStrategy([{ kid: 'test-key', publicKey: es256Pem }]);

    const outcome = await runStrategy(strategy, es256Token);

    expect(outcome.type).toBe('success');
    expect(outcome.user).toMatchObject({ id: USER_ID, email: USER.email });
  });

  it('should reject ES256 tokens from unknown keys', async () => {
    const strategy = buildStrategy([{ kid: 'test-key', publicKey: es256Pem }]);

    const outcome = await runStrategy(strategy, unknownKeyToken);

    expect(outcome.type).toBe('fail');
  });

  it('should reject ES256 tokens when no public keys are configured', async () => {
    const strategy = buildStrategy([]);

    const outcome = await runStrategy(strategy, es256Token);

    expect(outcome.type).toBe('fail');
  });

  it('should reject HS256 tokens signed with the ES256 public key as HMAC secret', async () => {
    const strategy = buildStrategy([{ kid: 'test-key', publicKey: es256Pem }]);
    const confusedToken = await signHs256(es256Pem);

    const outcome = await runStrategy(strategy, confusedToken);

    expect(outcome.type).toBe('fail');
  });

  it('should reject unsigned tokens with alg none', async () => {
    const strategy = buildStrategy([{ kid: 'test-key', publicKey: es256Pem }]);

    const outcome = await runStrategy(strategy, unsignedToken());

    expect(outcome.type).toBe('fail');
  });

  it('should reject tokens with a malformed header segment', async () => {
    const strategy = buildStrategy([{ kid: 'test-key', publicKey: es256Pem }]);

    const outcome = await runStrategy(strategy, 'not-json-header.payload.sig');

    expect(outcome.type).toBe('fail');
  });
});

describe('JwtStrategy.validate', () => {
  const SESSION_USER_ID = '11111111-1111-1111-1111-111111111111';
  const VERIFIED_AT = new Date('2026-08-01T10:00:00.000Z');

  const options = {
    tokenConfig: {
      accessTokenSecret: 'a'.repeat(48),
      refreshTokenSecret: 'b'.repeat(48),
    },
  } as AuthModuleOptions;

  const sessionUser = {
    id: SESSION_USER_ID,
    email: 'user@example.com',
    name: 'Test User',
    avatarUrl: null,
    emailVerifiedAt: VERIFIED_AT,
    locale: 'es',
    role: 'user',
  };

  const sessionPayload = {
    sub: SESSION_USER_ID,
    email: 'user@example.com',
    familyId: 'family-1',
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE_ACCESS,
  };

  let userRepository: UserRepository;
  let sessionRepository: SessionRepository;
  let strategy: JwtStrategy;

  beforeEach(() => {
    userRepository = {
      findById: vi.fn().mockResolvedValue(sessionUser),
    } as unknown as UserRepository;
    sessionRepository = {
      hasLiveSessionForFamily: vi.fn().mockResolvedValue(true),
    } as unknown as SessionRepository;
    strategy = new JwtStrategy(options, userRepository, sessionRepository);
  });

  it('should accept a session token whose family is live', async () => {
    const result = await strategy.validate(sessionPayload);
    expect(result.id).toBe(SESSION_USER_ID);
    expect(sessionRepository.hasLiveSessionForFamily).toHaveBeenCalledWith(
      'family-1'
    );
  });

  it('should carry the stored profile fields the client reads', async () => {
    const result = await strategy.validate(sessionPayload);

    expect(result.emailVerifiedAt).toEqual(VERIFIED_AT);
    expect(result.locale).toBe('es');
  });

  it('should report an unverified email as null rather than omitting it', async () => {
    vi.mocked(userRepository.findById).mockResolvedValue({
      ...sessionUser,
      emailVerifiedAt: null,
      locale: null,
    } as unknown as UserEntity);

    const result = await strategy.validate(sessionPayload);

    expect(result.emailVerifiedAt).toBeNull();
    expect(result.locale).toBeNull();
  });

  it('should serialize the verified timestamp as an ISO string over HTTP', async () => {
    const result = await strategy.validate(sessionPayload);

    const overTheWire: unknown = JSON.parse(JSON.stringify(result));
    const emailVerifiedAt = (overTheWire as { emailVerifiedAt?: unknown })
      .emailVerifiedAt;

    expect(typeof emailVerifiedAt).toBe('string');
    expect(emailVerifiedAt).toBe(VERIFIED_AT.toISOString());
  });

  it('should reject a session token after its family is revoked', async () => {
    vi.mocked(sessionRepository.hasLiveSessionForFamily).mockResolvedValue(
      false
    );
    await expect(strategy.validate(sessionPayload)).rejects.toThrow(
      'Session revoked'
    );
  });

  it('should reject session tokens with a wrong issuer', async () => {
    await expect(
      strategy.validate({ ...sessionPayload, iss: 'wrong-issuer' })
    ).rejects.toThrow('Invalid token');
  });

  it('should reject session tokens missing the audience claim', async () => {
    const { aud: _aud, ...payloadWithoutAud } = sessionPayload;
    await expect(strategy.validate(payloadWithoutAud)).rejects.toThrow(
      'Invalid token'
    );
  });

  it('should reject session tokens missing the issuer claim', async () => {
    const { iss: _iss, ...payloadWithoutIssuer } = sessionPayload;
    await expect(strategy.validate(payloadWithoutIssuer)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('should reject session tokens with a wrong audience', async () => {
    await expect(
      strategy.validate({ ...sessionPayload, aud: 'knowtis:refresh' })
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should reject session tokens missing familyId', async () => {
    const { familyId: _familyId, ...payloadWithoutFamilyId } = sessionPayload;
    await expect(strategy.validate(payloadWithoutFamilyId)).rejects.toThrow(
      UnauthorizedException
    );
  });

  it('should skip session checks for externally-scoped tokens', async () => {
    const result = await strategy.validate({
      sub: SESSION_USER_ID,
      email: 'user@example.com',
      source: 'mcp',
    });
    expect(result.id).toBe(SESSION_USER_ID);
    expect(sessionRepository.hasLiveSessionForFamily).not.toHaveBeenCalled();
  });
});
