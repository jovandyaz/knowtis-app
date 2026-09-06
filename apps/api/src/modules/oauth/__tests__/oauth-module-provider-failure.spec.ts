import { generateKeyPairSync } from 'node:crypto';

import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { expect, it, vi } from 'vitest';

import { DATABASE_CONNECTION } from '../../../database';

const { createOidcProvider } = vi.hoisted(() => ({
  createOidcProvider: vi.fn(),
}));

vi.mock('../oidc-provider.factory', async (importOriginal) => ({
  ...(await importOriginal()),
  createOidcProvider,
}));

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

it('fails configured OAuth boot without logging provider details', async () => {
  const rawFailure = 'raw-provider-private-error';
  const privateKeyLabel = 'private-configured-key-label';
  const errorSpy = vi
    .spyOn(Logger.prototype, 'error')
    .mockImplementation(() => undefined);
  createOidcProvider.mockRejectedValue(new Error(rawFailure));
  const {
    OAUTH_INITIALIZATION_FAILED_MESSAGE,
    OauthInitializationError,
    OauthModule,
  } = await import('../oauth.module');
  let caught: unknown;

  try {
    await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              OAUTH_ISSUER: 'https://api.knowtis.app',
              OAUTH_JWKS: JSON.stringify({
                keys: [signingJwk(privateKeyLabel)],
              }),
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
  } catch (error) {
    caught = error;
  }

  expect(caught).toBeInstanceOf(OauthInitializationError);
  expect((caught as Error).name).toBe('OauthInitializationError');
  expect((caught as Error).message).toBe(OAUTH_INITIALIZATION_FAILED_MESSAGE);
  expect((caught as Error).cause).toBeUndefined();
  const serialized = `${String(caught)} ${(caught as Error).stack ?? ''} ${JSON.stringify((caught as Error).cause ?? null)}`;
  expect(serialized).not.toContain(rawFailure);
  expect(serialized).not.toContain(privateKeyLabel);
  const logged = errorSpy.mock.calls.flat().join(' ');
  expect(logged).not.toContain(rawFailure);
  expect(logged).not.toContain(privateKeyLabel);
});
