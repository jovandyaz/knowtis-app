import { Inject, Injectable } from '@nestjs/common';
import type { Result } from 'neverthrow';

import type { ArtifactDomainError } from '../../domain/errors';
import {
  ARTIFACT_WRITE_REPOSITORY,
  type ArtifactWriteRepository,
} from '../../domain/ports';

@Injectable()
export class DeleteArtifactHandler {
  constructor(
    @Inject(ARTIFACT_WRITE_REPOSITORY)
    private readonly repository: ArtifactWriteRepository
  ) {}

  async execute(input: {
    artifactId: string;
    userId: string;
  }): Promise<Result<boolean, ArtifactDomainError>> {
    return this.repository.delete(input.artifactId, input.userId);
  }
}
