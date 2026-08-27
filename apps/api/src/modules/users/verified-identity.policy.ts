import { ForbiddenException, Injectable } from '@nestjs/common';

import {
  EMAIL_NOT_VERIFIED_CODE,
  FEATURE_FLAG_KEYS,
} from '@knowtis/shared-types';

import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { UsersService } from './users.service';

@Injectable()
export class VerifiedIdentityPolicy {
  constructor(
    private readonly usersService: UsersService,
    private readonly featureFlags: FeatureFlagsService
  ) {}

  /**
   * True when the gate is off (dark) or the user is a verified, non-anonymous account.
   *
   * Read from the database per call: the copilot's WebSocket handshake captures only
   * `userId`/`isAnonymous`, so a cached claim goes stale for the life of the socket.
   */
  async isVerified(userId: string): Promise<boolean> {
    if (
      !(await this.featureFlags.isEnabled(
        FEATURE_FLAG_KEYS.EMAIL_VERIFICATION_GATE
      ))
    ) {
      return true;
    }

    const user = await this.usersService.findById(userId);

    return !!user && !user.isAnonymous && user.emailVerifiedAt !== null;
  }

  /** Resolves when {@link isVerified} holds; otherwise throws 403 `EMAIL_NOT_VERIFIED`. */
  async assertVerified(userId: string, message: string): Promise<void> {
    if (!(await this.isVerified(userId))) {
      throw new ForbiddenException({ code: EMAIL_NOT_VERIFIED_CODE, message });
    }
  }
}
