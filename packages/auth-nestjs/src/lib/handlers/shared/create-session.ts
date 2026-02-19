import { hashToken, SESSION_EXPIRY_MS, UserId } from '@jovandyaz/auth/server';
import type { AuthDomainError, AuthTokens } from '@jovandyaz/auth/server';
import { err, ok, type Result } from 'neverthrow';

import type { SessionRepository } from '../../ports/session.repository';
import type { TokenService } from '../../ports/token.service';

interface CreateSessionDeps {
  tokenService: TokenService;
  sessionRepository: SessionRepository;
}

interface CreateSessionParams {
  userId: string;
  email: string;
  userAgent?: string | undefined;
  ipAddress?: string | undefined;
}

export async function createSessionWithTokens(
  deps: CreateSessionDeps,
  params: CreateSessionParams
): Promise<Result<AuthTokens, AuthDomainError>> {
  const tokensResult = await deps.tokenService.generateTokens(
    UserId.fromTrusted(params.userId),
    params.email
  );
  if (tokensResult.isErr()) {
    return err(tokensResult.error);
  }

  const tokens = tokensResult.value;

  const sessionResult = await deps.sessionRepository.create({
    userId: params.userId,
    refreshTokenHash: hashToken(tokens.refreshToken),
    userAgent: params.userAgent,
    ipAddress: params.ipAddress,
    expiresAt: new Date(Date.now() + SESSION_EXPIRY_MS),
  });
  if (sessionResult.isErr()) {
    return err(sessionResult.error);
  }

  return ok(tokens);
}
