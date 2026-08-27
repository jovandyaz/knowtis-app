import { AuthEventName, UserLoggedOutEvent } from '@jovandyaz/auth/server';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ok, type Result } from 'neverthrow';

import { SESSION_REPOSITORY, TOKEN_HASHER } from '../constants';
import type { SessionRepository } from '../ports/session.repository';
import { TokenHasher } from '../services/token-hasher.service';

@Injectable()
export class LogoutUserHandler {
  private readonly logger = new Logger(LogoutUserHandler.name);

  constructor(
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: SessionRepository,
    @Inject(TOKEN_HASHER) private readonly tokenHasher: TokenHasher,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(refreshToken: string): Promise<Result<void, AuthDomainError>> {
    const tokenHash = this.tokenHasher.hash(refreshToken);
    const session =
      await this.sessionRepository.findByRefreshTokenHash(tokenHash);

    if (session) {
      await this.sessionRepository.deleteById(session.id);
      this.eventEmitter.emit(
        AuthEventName.LOGOUT,
        new UserLoggedOutEvent(session.userId, new Date())
      );
    } else {
      this.logger.warn(
        'Logout attempted with a refresh token that has no matching session'
      );
    }

    return ok(undefined);
  }
}
