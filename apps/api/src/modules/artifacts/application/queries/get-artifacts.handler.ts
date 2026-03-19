import { Inject, Injectable } from '@nestjs/common';
import { ok, type Result } from 'neverthrow';

import type { ArtifactDomainError } from '../../domain/errors';
import {
  ARTIFACT_READ_REPOSITORY,
  type ArtifactEntity,
  type ArtifactReadRepository,
} from '../../domain/ports';

@Injectable()
export class GetArtifactsHandler {
  constructor(
    @Inject(ARTIFACT_READ_REPOSITORY)
    private readonly repository: ArtifactReadRepository
  ) {}

  async execute(input: {
    userId: string;
    noteId?: string;
  }): Promise<Result<ArtifactEntity[], ArtifactDomainError>> {
    const artifacts = input.noteId
      ? await this.repository.findByNoteId(input.noteId, input.userId)
      : await this.repository.findByUserId(input.userId);
    return ok(artifacts);
  }
}
