import { randomUUID } from 'node:crypto';

import { SESSION_EXPIRY_MS, UserId } from '@jovandyaz/auth/server';
import type { AuthDomainError, AuthTokens } from '@jovandyaz/auth/server';
import { err, ok, type Result } from 'neverthrow';

import type { SessionRepository } from '../../ports/session.repository';
import type { TokenService } from '../../ports/token.service';
import { TokenHasher } from '../../services/token-hasher.service';

interface CreateSessionDeps {
  tokenService: TokenService;
  sessionRepository: SessionRepository;
  tokenHasher: TokenHasher;
}

interface CreateSessionParams {
  userId: string;
  email: string;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
  isAnonymous?: boolean | undefined;
  familyId?: string | undefined;
}

export async function createSessionWithTokens(
  deps: CreateSessionDeps,
  params: CreateSessionParams
): Promise<Result<AuthTokens, AuthDomainError>> {
  const familyId = params.familyId ?? randomUUID();

  const tokensResult = await deps.tokenService.generateTokens(
    UserId.fromTrusted(params.userId),
    params.email,
    { familyId, ...(params.isAnonymous && { isAnonymous: true }) }
  );
  if (tokensResult.isErr()) {
    return err(tokensResult.error);
  }

  const tokens = tokensResult.value;

  const sessionResult = await deps.sessionRepository.create({
    userId: params.userId,
    familyId,
    refreshTokenHash: deps.tokenHasher.hash(tokens.refreshToken),
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
    expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
  });
  if (sessionResult.isErr()) {
    return err(sessionResult.error);
  }

  return ok(tokens);
}
