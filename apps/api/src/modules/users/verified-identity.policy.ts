import { ForbiddenException, Injectable } from '@nestjs/common';

import { EMAIL_NOT_VERIFIED_CODE } from '@knowtis/shared-types';

import { UsersService } from './users.service';

@Injectable()
export class VerifiedIdentityPolicy {
  constructor(private readonly usersService: UsersService) {}

  /**
   * True when the user is a verified, non-anonymous account.
   *
   * Takes an id rather than a loaded user because `ApproveMutationHandler` reaches
   * it from the agent socket, whose handshake carries only `userId`/`isAnonymous`.
   */
  async isVerified(userId: string): Promise<boolean> {
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
