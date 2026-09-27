import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';

import { AuthModule } from '../../modules/auth/auth.module';
import { BearerIdentityResolver } from '../auth/bearer-identity.resolver';
import { UserScopedThrottlerGuard } from './user-scoped-throttler.guard';

const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 60;
const THROTTLED_MESSAGE =
  'Too many requests. Please slow down and try again shortly.';

/**
 * Rate limiting for the whole API: the default budget every route gets, and the
 * app-wide guard that spends it per registered user. Routes narrow the
 * budget with `@Throttle`; none of them register a guard of their own.
 *
 * `RATE_LIMITING_ENABLED=false` skips every budget. It exists for disposable
 * test environments, where one automated client on one IP would spend the
 * login and refresh budgets in a few page loads; the env schema refuses it in
 * production.
 *
 * JwtModule is here because bucketing by user means verifying the caller's
 * bearer token — see BearerIdentityResolver.
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const enabled = config.getOrThrow<boolean>('RATE_LIMITING_ENABLED');
        if (!enabled) {
          new Logger(ThrottlingModule.name).warn(
            'Rate limiting disabled by RATE_LIMITING_ENABLED=false; every route budget is skipped'
          );
        }
        return {
          throttlers: [{ ttl: WINDOW_MS, limit: REQUESTS_PER_WINDOW }],
          skipIf: () => !enabled,
          errorMessage: THROTTLED_MESSAGE,
        };
      },
    }),
    JwtModule.register({}),
    AuthModule,
  ],
  providers: [
    BearerIdentityResolver,
    {
      provide: APP_GUARD,
      useClass: UserScopedThrottlerGuard,
    },
  ],
})
export class ThrottlingModule {}
