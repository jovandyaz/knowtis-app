import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * Buckets rate limits by authenticated user id so the cap survives IP rotation
 * and is never shared across users behind the same NAT. Falls back to the
 * IP-based tracker for unauthenticated requests. Must run after the auth guard
 * so `req.user` is populated.
 */
@Injectable()
export class UserScopedThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, unknown>
  ): Promise<string> {
    const user = req.user as { id?: unknown } | undefined;
    const userId = user?.id;
    return typeof userId === 'string' && userId.length > 0
      ? `user:${userId}`
      : super.getTracker(req);
  }
}
