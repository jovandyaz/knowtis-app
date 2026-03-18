export interface ArtifactDomainError {
  readonly code: string;
  readonly message: string;
}

export const ArtifactErrorCodes = {
  INVALID_ARTIFACT_TYPE: 'INVALID_ARTIFACT_TYPE',
  ARTIFACT_NOT_FOUND: 'ARTIFACT_NOT_FOUND',
  PERMISSION_DENIED: 'PERMISSION_DENIED',
  GENERATION_FAILED: 'GENERATION_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ArtifactErrorCode =
  (typeof ArtifactErrorCodes)[keyof typeof ArtifactErrorCodes];

function createArtifactError(
  code: ArtifactErrorCode,
  message: string
): ArtifactDomainError {
  return { code, message };
}

export const ArtifactErrors = {
  invalidType: (type: string) =>
    createArtifactError(
      ArtifactErrorCodes.INVALID_ARTIFACT_TYPE,
      `Invalid artifact type: ${type}`
    ),

  notFound: (id: string) =>
    createArtifactError(
      ArtifactErrorCodes.ARTIFACT_NOT_FOUND,
      `Artifact not found: ${id}`
    ),

  permissionDenied: (message = 'Permission denied') =>
    createArtifactError(ArtifactErrorCodes.PERMISSION_DENIED, message),

  generationFailed: (reason: string) =>
    createArtifactError(
      ArtifactErrorCodes.GENERATION_FAILED,
      `Artifact generation failed: ${reason}`
    ),

  internalError: (message: string) =>
    createArtifactError(
      ArtifactErrorCodes.INTERNAL_ERROR,
      `Internal error: ${message}`
    ),
} as const;
