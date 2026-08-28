import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
} from '@nestjs/throttler';
import type {
  ThrottlerModuleOptions,
  ThrottlerStorage,
} from '@nestjs/throttler';

import { BearerIdentityResolver } from '../auth/bearer-identity.resolver';

const USER_TRACKER_PREFIX = 'user:';

/**
 * Buckets every rate limit by the registered user a request authenticates as,
 * so no cap is shared by everyone behind one NAT. Everyone else keeps the IP
 * tracker, which is what still protects the anonymous endpoints.
 *
 * It resolves the caller from the bearer token rather than `req.user`: as the
 * app-wide guard it runs ahead of every auth guard, so `req.user` is still
 * empty here.
 */
@Injectable()
export class UserScopedThrottlerGuard extends ThrottlerGuard {
  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    private readonly bearerIdentityResolver: BearerIdentityResolver
  ) {
    super(options, storageService, reflector);
  }

  protected override async getTracker(
    req: Record<string, unknown>
  ): Promise<string> {
    const identity = await this.bearerIdentityResolver.resolve(req);
    // An anonymous session is mintable on demand, so giving it a private bucket
    // would sell unlimited budget to anyone willing to mint identities.
    if (identity === null || identity.isAnonymous) {
      return super.getTracker(req);
    }
    return `${USER_TRACKER_PREFIX}${identity.userId}`;
  }
}
