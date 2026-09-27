import {
  JWT_AUDIENCE_ACCESS,
  JWT_AUDIENCE_REFRESH,
  JWT_ISSUER,
} from '@jovandyaz/auth-nestjs';
import { UserId } from '@jovandyaz/auth/server';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { JwtTokenService } from './jwt-token.service';

function createConfig(): ConfigService {
  const secrets: Record<string, string> = {
    JWT_SECRET: 'access-secret',
    JWT_REFRESH_SECRET: 'refresh-secret',
  };
  return {
    getOrThrow: (key: string) => secrets[key],
    get: (_key: string, fallback?: string) => fallback,
  } as unknown as ConfigService;
}

function createService(): JwtTokenService {
  return new JwtTokenService(new JwtService(), createConfig());
}

const ACCESS_SECRET = 'a'.repeat(48);
const REFRESH_SECRET = 'b'.repeat(48);

interface DecodedClaims {
  iss?: string;
  aud?: string;
  sub?: string;
  iat?: number;
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

  describe('within a single second', () => {
    beforeEach(() => {
      vi.useFakeTimers({
        toFake: ['Date'],
        now: new Date('2026-09-27T12:00:00.000Z'),
      });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('signs a distinct refresh token on every call for the same user and family', async () => {
      const jwtService = new JwtService();
      const service = new JwtTokenService(jwtService, createConfig());

      const first = await service.generateTokens(userId, 'u@example.com', {
        familyId: 'fam-9',
      });
      const second = await service.generateTokens(userId, 'u@example.com', {
        familyId: 'fam-9',
      });

      const firstToken = first._unsafeUnwrap().refreshToken;
      const secondToken = second._unsafeUnwrap().refreshToken;
      expect(jwtService.decode<DecodedClaims>(firstToken).iat).toBe(
        jwtService.decode<DecodedClaims>(secondToken).iat
      );
      expect(firstToken).not.toBe(secondToken);
    });
  });

  it('rejects a refresh token signed with the wrong secret', async () => {
    const service = createService();
    const forged = await new JwtService().signAsync(
      { sub: userId.value, email: 'u@example.com', familyId: 'fam-9' },
      { secret: 'access-secret', expiresIn: '7d', algorithm: 'HS256' }
    );

    const verified = await service.verifyRefreshToken(forged);

    expect(verified.isErr()).toBe(true);
  });

  describe('issuer and audience claims', () => {
    let service: JwtTokenService;
    let jwtService: JwtService;

    beforeEach(() => {
      jwtService = new JwtService({});
      const configService = {
        getOrThrow: (key: string) =>
          key === 'JWT_SECRET' ? ACCESS_SECRET : REFRESH_SECRET,
        get: (_key: string, defaultValue?: unknown) => defaultValue,
      } as unknown as ConfigService;
      service = new JwtTokenService(jwtService, configService);
    });

    it('should sign access tokens with issuer and access audience', async () => {
      const result = await service.generateTokens(
        UserId.fromTrusted('11111111-1111-1111-1111-111111111111'),
        'user@example.com'
      );
      expect(result.isOk()).toBe(true);
      const decoded = jwtService.decode<DecodedClaims>(
        result._unsafeUnwrap().accessToken
      );
      expect(decoded.iss).toBe(JWT_ISSUER);
      expect(decoded.aud).toBe(JWT_AUDIENCE_ACCESS);
    });

    it('should sign refresh tokens with issuer and refresh audience', async () => {
      const result = await service.generateTokens(
        UserId.fromTrusted('11111111-1111-1111-1111-111111111111'),
        'user@example.com'
      );
      const decoded = jwtService.decode<DecodedClaims>(
        result._unsafeUnwrap().refreshToken
      );
      expect(decoded.iss).toBe(JWT_ISSUER);
      expect(decoded.aud).toBe(JWT_AUDIENCE_REFRESH);
    });

    it('should reject refresh tokens missing issuer/audience claims', async () => {
      const legacyToken = await jwtService.signAsync(
        {
          sub: '11111111-1111-1111-1111-111111111111',
          email: 'user@example.com',
        },
        { secret: REFRESH_SECRET, expiresIn: '7d', algorithm: 'HS256' }
      );
      const result = await service.verifyRefreshToken(legacyToken);
      expect(result.isErr()).toBe(true);
    });

    it('should accept refresh tokens carrying the expected claims', async () => {
      const generated = await service.generateTokens(
        UserId.fromTrusted('11111111-1111-1111-1111-111111111111'),
        'user@example.com'
      );
      const result = await service.verifyRefreshToken(
        generated._unsafeUnwrap().refreshToken
      );
      expect(result.isOk()).toBe(true);
    });

    it('should reject refresh tokens with a wrong issuer', async () => {
      const tampered = await jwtService.signAsync(
        {
          sub: '11111111-1111-1111-1111-111111111111',
          email: 'user@example.com',
        },
        {
          secret: REFRESH_SECRET,
          expiresIn: '7d',
          algorithm: 'HS256',
          issuer: 'evil-api',
          audience: JWT_AUDIENCE_REFRESH,
        }
      );
      const result = await service.verifyRefreshToken(tampered);
      expect(result.isErr()).toBe(true);
    });

    it('should reject refresh tokens with a mismatched audience', async () => {
      const tampered = await jwtService.signAsync(
        {
          sub: '11111111-1111-1111-1111-111111111111',
          email: 'user@example.com',
        },
        {
          secret: REFRESH_SECRET,
          expiresIn: '7d',
          algorithm: 'HS256',
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE_ACCESS,
        }
      );
      const result = await service.verifyRefreshToken(tampered);
      expect(result.isErr()).toBe(true);
    });
  });
});
