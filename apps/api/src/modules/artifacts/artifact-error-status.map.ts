import { HttpStatus } from '@nestjs/common';

import { ArtifactErrorCodes } from './domain';

export const ARTIFACT_ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [ArtifactErrorCodes.INVALID_ARTIFACT_TYPE]: HttpStatus.BAD_REQUEST,
  [ArtifactErrorCodes.ARTIFACT_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [ArtifactErrorCodes.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [ArtifactErrorCodes.EMPTY_CONTENT]: HttpStatus.BAD_REQUEST,
  [ArtifactErrorCodes.CONTENT_TOO_LARGE]: HttpStatus.PAYLOAD_TOO_LARGE,
  [ArtifactErrorCodes.GENERATION_FAILED]: HttpStatus.BAD_GATEWAY,
  [ArtifactErrorCodes.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};
