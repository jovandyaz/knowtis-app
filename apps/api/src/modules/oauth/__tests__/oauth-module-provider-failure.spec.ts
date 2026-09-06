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
  const { OauthModule } = await import('../oauth.module');

  await expect(
    Test.createTestingModule({
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
    }).compile()
  ).rejects.toThrow(rawFailure);
  const logged = errorSpy.mock.calls.flat().join(' ');
  expect(logged).not.toContain(rawFailure);
  expect(logged).not.toContain(privateKeyLabel);
});
