import {
  AuthErrors,
  AuthEventName,
  EmailVerifiedEvent,
  UserId,
} from '@jovandyaz/auth/server';
import type {
  AuthDomainError,
  EmailVerificationSource,
} from '@jovandyaz/auth/server';
import { Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, ok, type Result } from 'neverthrow';

import type { EmailVerificationTokenRepository } from '../../ports/email-verification-token.repository';
import type { SessionRepository } from '../../ports/session.repository';
import type { UserRepository } from '../../ports/user.repository';

interface CompleteEmailVerificationDeps {
  userRepository: UserRepository;
  verificationTokenRepository: EmailVerificationTokenRepository;
  sessionRepository: SessionRepository;
  eventEmitter: EventEmitter2;
  logger: Logger;
}

interface CompleteEmailVerificationParams {
  userId: string;
  source: EmailVerificationSource;
  /** Session family spared from revocation; every session goes when absent. */
  keepSessionFamilyId?: string | undefined;
}

/**
 * Marks the email verified, clears the outstanding verification rows, revokes
 * sessions and announces the change. Callers own the proof of ownership and
 * decide, via `keepSessionFamilyId`, which sessions survive.
 */
export async function completeEmailVerification(
  deps: CompleteEmailVerificationDeps,
  params: CompleteEmailVerificationParams
): Promise<Result<void, AuthDomainError>> {
  const userId = UserId.fromTrusted(params.userId);

  const user = await deps.userRepository.findById(userId);
  if (user?.emailVerifiedAt) {
    await deps.verificationTokenRepository.deleteAllByUserId(params.userId);
    return err(AuthErrors.emailAlreadyVerified());
  }

  // Sessions go before the flag, as they do after a password reset. Marking
  // first makes the write that follows unreachable on a retry: the second call
  // stops at the already-verified branch above, so a revocation that failed
  // once would never be attempted again and the sessions this evicts would
  // outlive the verification. Revoking too eagerly only costs a sign-in.
  if (params.keepSessionFamilyId) {
    await deps.sessionRepository.deleteAllByUserIdExceptFamily(
      params.userId,
      params.keepSessionFamilyId
    );
  } else {
    await deps.sessionRepository.deleteAllByUserId(params.userId);
  }

  const verifyResult = await deps.userRepository.markEmailVerified(userId);
  if (verifyResult.isErr()) {
    deps.logger.error(
      `Failed to mark email verified for user ${params.userId}`
    );
    return err(verifyResult.error);
  }

  await deps.verificationTokenRepository.deleteAllByUserId(params.userId);

  deps.eventEmitter.emit(
    AuthEventName.EMAIL_VERIFIED,
    new EmailVerifiedEvent(params.userId, params.source, new Date())
  );

  return ok(undefined);
}
