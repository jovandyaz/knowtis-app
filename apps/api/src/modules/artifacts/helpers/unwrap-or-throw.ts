import { HttpException, HttpStatus } from '@nestjs/common';
import type { Result } from 'neverthrow';

import { ArtifactErrorCodes, type ArtifactDomainError } from '../domain';

const ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [ArtifactErrorCodes.INVALID_ARTIFACT_TYPE]: HttpStatus.BAD_REQUEST,
  [ArtifactErrorCodes.ARTIFACT_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ArtifactErrorCodes.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [ArtifactErrorCodes.EMPTY_CONTENT]: HttpStatus.BAD_REQUEST,
  [ArtifactErrorCodes.GENERATION_FAILED]: HttpStatus.BAD_GATEWAY,
  [ArtifactErrorCodes.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

export function unwrapOrThrow<T>(result: Result<T, ArtifactDomainError>): T {
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
