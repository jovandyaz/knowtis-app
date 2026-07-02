import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { DATABASE_CONNECTION } from '../../../database';
import { OAUTH_PROVIDER } from '../oauth.tokens';

@Global()
@Module({
  providers: [{ provide: DATABASE_CONNECTION, useValue: {} }],
  exports: [DATABASE_CONNECTION],
})
class StubDatabaseModule {}

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
});
