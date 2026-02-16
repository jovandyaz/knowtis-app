import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ok, type Result } from 'neverthrow';

import type { AuthDomainError } from '../../domain/errors/auth.errors';
import {
  AuthEventName,
  UserLoggedOutEvent,
} from '../../domain/events/auth.events';
import { hashToken } from '../../domain/hash-token';
import {
  SESSION_REPOSITORY,
  type SessionRepository,
} from '../../domain/ports/session.repository';

@Injectable()
export class LogoutUserHandler {
  private readonly logger = new Logger(LogoutUserHandler.name);

  constructor(
    @Inject(SESSION_REPOSITORY)
    private readonly sessionRepository: SessionRepository,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(refreshToken: string): Promise<Result<void, AuthDomainError>> {
    const tokenHash = hashToken(refreshToken);
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
