import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../config/env.config';
import { getOauthConfig } from '../../config/oauth.config';
import { DATABASE_CONNECTION, type Database } from '../../database';
import { FeatureFlagsModule } from '../feature-flags';
import {
  createOidcProvider,
  type OidcProviderHandle,
} from './oidc-provider.factory';

export const OAUTH_PROVIDER = 'OAUTH_PROVIDER';

@Module({
  imports: [FeatureFlagsModule],
  providers: [
    {
      provide: OAUTH_PROVIDER,
      useFactory: async (
        config: ConfigService<EnvConfig, true>,
        db: Database
      ): Promise<OidcProviderHandle | null> => {
        const oauthConfig = getOauthConfig(config);
        if (!oauthConfig) {
          return null;
        }
        const frontendUrl = config.get('FRONTEND_URL', { infer: true });
        const handle = await createOidcProvider({
          db,
          ...oauthConfig,
          frontendUrl,
        });
        new Logger('OauthModule').log(
          `OAuth AS initialized (issuer: ${oauthConfig.issuer})`
        );
        return handle;
      },
      inject: [ConfigService, DATABASE_CONNECTION],
    },
  ],
  exports: [OAUTH_PROVIDER],
})
export class OauthModule {}
