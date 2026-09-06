import { generateKeyPairSync } from 'node:crypto';

import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { InvalidOauthJwksError } from '../../../config/oauth-public-keys';
import { DATABASE_CONNECTION } from '../../../database';
import { OAUTH_PROVIDER } from '../oauth.tokens';

@Global()
@Module({
  providers: [{ provide: DATABASE_CONNECTION, useValue: {} }],
  exports: [DATABASE_CONNECTION],
})
class StubDatabaseModule {}

function signingJwk(kid: string): Record<string, unknown> {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  return {
    ...privateKey.export({ format: 'jwk' }),
    kid,
    alg: 'ES256',
    use: 'sig',
  };
}

async function bootstrapWith(rawJwks: string): Promise<void> {
  const { OauthModule } = await import('../oauth.module');
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        load: [
          () => ({
            OAUTH_ISSUER: 'https://api.knowtis.app',
            OAUTH_JWKS: rawJwks,
            OAUTH_COOKIE_KEYS: 'test-cookie-key',
            MCP_RESOURCE_URL: 'https://mcp.knowtis.app/mcp',
            FRONTEND_URL: 'https://knowtis.app',
          }),
        ],
      }),
      StubDatabaseModule,
      OauthModule,
    ],
  }).compile();
  await moduleRef.close();
}

describe('OauthModule bootstrap', () => {
  it('compiles the real module graph with the controller wired', async () => {
    const { OauthModule } = await import('../oauth.module');
    const { OauthInteractionController } =
      await import('../oauth-interaction.controller');
    const { OauthGrantsController } =
      await import('../oauth-grants.controller');

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
        StubDatabaseModule,
        OauthModule,
      ],
    }).compile();

    expect(moduleRef.get(OauthInteractionController)).toBeDefined();
    expect(moduleRef.get(OauthGrantsController)).toBeDefined();
    expect(moduleRef.get(OAUTH_PROVIDER)).toBeNull();
    await moduleRef.close();
  });

  it('boots the authorization server for an eligible single-key JWKS', async () => {
    await expect(
      bootstrapWith(JSON.stringify({ keys: [signingJwk('boot-key')] }))
    ).resolves.toBeUndefined();
  });

  it.each([
    ['non-EC key', { ...signingJwk('bad'), kty: 'RSA' }],
    ['non-P-256 key', { ...signingJwk('bad'), crv: 'P-384' }],
    ['non-ES256 key', { ...signingJwk('bad'), alg: 'ES384' }],
    ['non-signing key', { ...signingJwk('bad'), use: 'enc' }],
    ['blank kid', { ...signingJwk('bad'), kid: '' }],
  ])('refuses to boot for a %s', async (_name, key) => {
    await expect(
      bootstrapWith(JSON.stringify({ keys: [key] }))
    ).rejects.toThrow(InvalidOauthJwksError);
  });

  it.each([
    ['malformed JSON', 'not-json'],
    ['missing keys array', JSON.stringify({ issuer: 'ignored' })],
    ['empty keys array', JSON.stringify({ keys: [] })],
  ])('refuses to boot for %s', async (_name, rawJwks) => {
    await expect(bootstrapWith(rawJwks)).rejects.toThrow(InvalidOauthJwksError);
  });

  it('refuses to boot for duplicate kids', async () => {
    const rawJwks = JSON.stringify({
      keys: [signingJwk('duplicate'), signingJwk('duplicate')],
    });
    await expect(bootstrapWith(rawJwks)).rejects.toThrow(InvalidOauthJwksError);
  });

  it('refuses to boot instead of retaining a valid subset', async () => {
    const rawJwks = JSON.stringify({
      keys: [
        signingJwk('valid'),
        {
          kty: 'EC',
          crv: 'P-256',
          alg: 'ES256',
          use: 'sig',
          kid: 'broken',
          x: 'x',
          y: 'y',
        },
      ],
    });
    await expect(bootstrapWith(rawJwks)).rejects.toThrow(InvalidOauthJwksError);
  });
});
