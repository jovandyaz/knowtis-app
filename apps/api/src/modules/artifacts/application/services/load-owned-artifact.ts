import { err, ok, type Result } from 'neverthrow';

import type { ArtifactType } from '@knowtis/shared-types';

import {
  ArtifactErrors,
  type ArtifactDomainError,
} from '../../domain/errors/artifact.errors';
import type {
  ArtifactEntity,
  ArtifactReadRepository,
} from '../../domain/ports/artifact.repository';

/**
 * Loads an artifact the caller owns, of the expected type. An artifact owned by
 * someone else reports `notFound` rather than a permission error, so the endpoint
 * never confirms that an id exists to a stranger.
 */
export async function loadOwnedArtifact(
  repo: ArtifactReadRepository,
  artifactId: string,
  userId: string,
  expectedType: ArtifactType
): Promise<Result<ArtifactEntity, ArtifactDomainError>> {
  const artifact = await repo.findById(artifactId);

  if (!artifact || artifact.userId !== userId) {
    return err(ArtifactErrors.notFound(artifactId));
  }

  if (artifact.type !== expectedType) {
    return err(ArtifactErrors.invalidType(artifact.type));
  }

  return ok(artifact);
}
