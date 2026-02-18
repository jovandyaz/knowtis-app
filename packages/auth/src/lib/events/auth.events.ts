export const AuthEventName = {
  REGISTER: 'auth.register',
  LOGIN: 'auth.login',
  LOGIN_FAILED: 'auth.login.failed',
  TOKEN_REFRESH: 'auth.token.refresh',
  LOGOUT: 'auth.logout',
  PASSWORD_RESET_REQUESTED: 'auth.password.reset.requested',
  PASSWORD_RESET_COMPLETED: 'auth.password.reset.completed',
} as const;

export class UserRegisteredEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly ipAddress: string,
    public readonly userAgent: string,
    public readonly timestamp: Date
  ) {}
}

export class UserLoggedInEvent {
  constructor(
    public readonly userId: string,
    public readonly email: string,
    public readonly ipAddress: string,
    public readonly userAgent: string,
    public readonly timestamp: Date
  ) {}
}

export class LoginFailedEvent {
  constructor(
    public readonly email: string,
    public readonly ipAddress: string,
    public readonly userAgent: string,
    public readonly timestamp: Date
  ) {}
}

export class TokenRefreshedEvent {
  constructor(
    public readonly userId: string,
    public readonly timestamp: Date
  ) {}
}

export class UserLoggedOutEvent {
  constructor(
    public readonly userId: string,
    public readonly timestamp: Date
  ) {}
}

export class PasswordResetRequestedEvent {
  constructor(
    public readonly email: string,
    public readonly timestamp: Date
  ) {}
}

export class PasswordResetCompletedEvent {
  constructor(
    public readonly userId: string,
    public readonly timestamp: Date
  ) {}
}
