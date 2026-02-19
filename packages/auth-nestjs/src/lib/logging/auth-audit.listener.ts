import {
  AuthEventName,
  type LoginFailedEvent,
  type PasswordResetCompletedEvent,
  type PasswordResetRequestedEvent,
  type TokenRefreshedEvent,
  type UserLoggedInEvent,
  type UserLoggedOutEvent,
  type UserRegisteredEvent,
} from '@jovandyaz/auth/server';
import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';

@Injectable()
export class AuthAuditListener {
  private readonly logger = new Logger('AuthAudit');

  @OnEvent(AuthEventName.REGISTER)
  handleRegister(event: UserRegisteredEvent): void {
    this.logger.log(
      `User registered: userId=${event.userId} email=${event.email} ip=${event.ipAddress}`
    );
  }

  @OnEvent(AuthEventName.LOGIN)
  handleLogin(event: UserLoggedInEvent): void {
    this.logger.log(
      `User logged in: userId=${event.userId} email=${event.email} ip=${event.ipAddress}`
    );
  }

  @OnEvent(AuthEventName.LOGIN_FAILED)
  handleLoginFailed(event: LoginFailedEvent): void {
    this.logger.warn(
      `Failed login attempt: email=${event.email} ip=${event.ipAddress}`
    );
  }

  @OnEvent(AuthEventName.TOKEN_REFRESH)
  handleTokenRefresh(event: TokenRefreshedEvent): void {
    this.logger.log(`Token refreshed: userId=${event.userId}`);
  }

  @OnEvent(AuthEventName.LOGOUT)
  handleLogout(event: UserLoggedOutEvent): void {
    this.logger.log(`User logged out: userId=${event.userId}`);
  }

  @OnEvent(AuthEventName.PASSWORD_RESET_REQUESTED)
  handlePasswordResetRequested(event: PasswordResetRequestedEvent): void {
    this.logger.log(`Password reset requested: email=${event.email}`);
  }

  @OnEvent(AuthEventName.PASSWORD_RESET_COMPLETED)
  handlePasswordResetCompleted(event: PasswordResetCompletedEvent): void {
    this.logger.log(`Password reset completed: userId=${event.userId}`);
  }
}
