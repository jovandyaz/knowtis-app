export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const SESSION_REPOSITORY = Symbol('SESSION_REPOSITORY');
export const TOKEN_SERVICE = Symbol('TOKEN_SERVICE');
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const TOKEN_HASHER = Symbol('TOKEN_HASHER');
export const EMAIL_SERVICE = Symbol('EMAIL_SERVICE');
export const EMAIL_VERIFICATION_TOKEN_REPOSITORY = Symbol(
  'EMAIL_VERIFICATION_TOKEN_REPOSITORY'
);
export const PASSWORD_RESET_TOKEN_REPOSITORY = Symbol(
  'PASSWORD_RESET_TOKEN_REPOSITORY'
);
export const AUTH_MODULE_OPTIONS = Symbol('AUTH_MODULE_OPTIONS');

export const JWT_ISSUER = 'knowtis-api';
export const JWT_AUDIENCE_ACCESS = 'knowtis:access';
export const JWT_AUDIENCE_REFRESH = 'knowtis:refresh';
