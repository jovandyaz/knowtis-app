import { AuthErrorCodes } from '@jovandyaz/auth/server';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import { HttpException, HttpStatus } from '@nestjs/common';
import type { Result } from 'neverthrow';

const ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [AuthErrorCodes.INVALID_EMAIL]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.INVALID_PASSWORD]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.INVALID_USER_ID]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.WEAK_PASSWORD]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.EMAIL_ALREADY_EXISTS]: HttpStatus.CONFLICT,
  [AuthErrorCodes.USER_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [AuthErrorCodes.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
  [AuthErrorCodes.INVALID_CREDENTIALS]: HttpStatus.UNAUTHORIZED,
  [AuthErrorCodes.INVALID_REFRESH_TOKEN]: HttpStatus.UNAUTHORIZED,
  [AuthErrorCodes.TOKEN_REUSE_DETECTED]: HttpStatus.UNAUTHORIZED,
  [AuthErrorCodes.SESSION_NOT_FOUND]: HttpStatus.UNAUTHORIZED,
  [AuthErrorCodes.SESSION_EXPIRED]: HttpStatus.UNAUTHORIZED,
  [AuthErrorCodes.INVALID_RESET_TOKEN]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.RESET_TOKEN_EXPIRED]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.INVALID_VERIFICATION_TOKEN]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.VERIFICATION_TOKEN_EXPIRED]: HttpStatus.BAD_REQUEST,
  [AuthErrorCodes.EMAIL_ALREADY_VERIFIED]: HttpStatus.CONFLICT,
  [AuthErrorCodes.EMAIL_SEND_FAILED]: HttpStatus.INTERNAL_SERVER_ERROR,
};

export function unwrapOrThrow<T>(result: Result<T, AuthDomainError>): T {
  if (result.isErr()) {
    const status =
      ERROR_STATUS_MAP[result.error.code] ?? HttpStatus.BAD_REQUEST;
    throw new HttpException(
      {
        statusCode: status,
        error: result.error.code,
        message: result.error.message,
      },
      status
    );
  }
  return result.value;
}
