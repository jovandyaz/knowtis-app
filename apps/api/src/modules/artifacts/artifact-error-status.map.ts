import { HttpStatus } from '@nestjs/common';

import { ArtifactErrorCodes } from './domain/errors/artifact.errors';

export const ARTIFACT_ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [ArtifactErrorCodes.INVALID_ARTIFACT_TYPE]: HttpStatus.BAD_REQUEST,
  [ArtifactErrorCodes.ARTIFACT_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ArtifactErrorCodes.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [ArtifactErrorCodes.EMPTY_CONTENT]: HttpStatus.BAD_REQUEST,
  [ArtifactErrorCodes.CONTENT_TOO_LARGE]: HttpStatus.PAYLOAD_TOO_LARGE,
  [ArtifactErrorCodes.GENERATION_FAILED]: HttpStatus.BAD_GATEWAY,
  [ArtifactErrorCodes.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
  [ArtifactErrorCodes.INVALID_QUIZ_SCOPE]: HttpStatus.BAD_REQUEST,
  [ArtifactErrorCodes.INVALID_QUIZ_ANSWER]: HttpStatus.BAD_REQUEST,
  [ArtifactErrorCodes.INVALID_CARD_INDEX]: HttpStatus.BAD_REQUEST,
};
