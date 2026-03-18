import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { ArtifactErrors, type ArtifactDomainError } from '../../domain/errors';
import {
  ARTIFACT_READ_REPOSITORY,
  type ArtifactEntity,
  type ArtifactReadRepository,
} from '../../domain/ports';

@Injectable()
export class GetArtifactHandler {
  constructor(
    @Inject(ARTIFACT_READ_REPOSITORY)
    private readonly repository: ArtifactReadRepository
  ) {}

  async execute(input: {
    artifactId: string;
    userId: string;
  }): Promise<Result<ArtifactEntity, ArtifactDomainError>> {
    const artifact = await this.repository.findById(input.artifactId);

    if (!artifact || artifact.userId !== input.userId) {
      return err(ArtifactErrors.notFound(input.artifactId));
    }

    return ok(artifact);
  }
}
