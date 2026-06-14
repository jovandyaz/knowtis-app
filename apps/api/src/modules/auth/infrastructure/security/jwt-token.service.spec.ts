import { UserId } from '@jovandyaz/auth/server';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { describe, expect, it } from 'vitest';

import { JwtTokenService } from './jwt-token.service';

function createService(): JwtTokenService {
  const secrets: Record<string, string> = {
    JWT_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
  };
  const config = {
    getOrThrow: (key: string) => secrets[key],
    get: (_key: string, fallback?: string) => fallback,
  } as unknown as ConfigService;

  return new JwtTokenService(new JwtService(), config);
}

describe('JwtTokenService', () => {
  const userId = UserId.fromTrusted('11111111-1111-4111-8111-111111111111');

  it('round-trips the familyId claim through the refresh token', async () => {
    const service = createService();

    const generated = await service.generateTokens(userId, 'u@example.com', {
      familyId: 'fam-9',
    });
    expect(generated.isOk()).toBe(true);

    const verified = await service.verifyRefreshToken(
      generated._unsafeUnwrap().refreshToken
    );
    expect(verified.isOk()).toBe(true);
    expect(verified._unsafeUnwrap().familyId).toBe('fam-9');
  });

  it('omits familyId when none is provided', async () => {
    const service = createService();

    const generated = await service.generateTokens(userId, 'u@example.com');
    expect(generated.isOk()).toBe(true);

    const verified = await service.verifyRefreshToken(
      generated._unsafeUnwrap().refreshToken
    );
    expect(verified.isOk()).toBe(true);
    expect(verified._unsafeUnwrap().familyId).toBeUndefined();
  });
});
