import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerModule } from '@nestjs/throttler';

import { BearerIdentityResolver } from '../auth/bearer-identity.resolver';
import { UserScopedThrottlerGuard } from './user-scoped-throttler.guard';

const WINDOW_MS = 60_000;
const REQUESTS_PER_WINDOW = 60;

/**
 * Rate limiting for the whole API: the default budget every route gets, and the
 * app-wide guard that spends it per registered user. Routes narrow the
 * budget with `@Throttle`; none of them register a guard of their own.
 *
 * JwtModule is here because bucketing by user means verifying the caller's
 * bearer token — see BearerIdentityResolver.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: WINDOW_MS, limit: REQUESTS_PER_WINDOW }]),
    JwtModule.register({}),
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
