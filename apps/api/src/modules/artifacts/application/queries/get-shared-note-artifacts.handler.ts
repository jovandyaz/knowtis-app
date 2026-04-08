import { Inject, Injectable } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import { GENERAL_ACCESS } from '@knowtis/shared-types';

import {
  NOTE_READ_REPOSITORY,
  type NoteReadRepository,
} from '../../../notes/domain';
import {
  ARTIFACT_READ_REPOSITORY,
  type ArtifactEntity,
  type ArtifactReadRepository,
} from '../../domain';
import { ArtifactErrors, type ArtifactDomainError } from '../../domain/errors';

@Injectable()
export class GetSharedNoteArtifactsHandler {
  constructor(
    @Inject(NOTE_READ_REPOSITORY)
    private readonly noteReadRepo: NoteReadRepository,
    @Inject(ARTIFACT_READ_REPOSITORY)
    private readonly artifactReadRepo: ArtifactReadRepository
  ) {}

  async execute(
    token: string
  ): Promise<Result<ArtifactEntity[], ArtifactDomainError>> {
    const note = await this.noteReadRepo.findByShareToken(token);
    if (!note) {
      return err(ArtifactErrors.notFound(token));
    }

    if (note.generalAccess !== GENERAL_ACCESS.ANYONE_WITH_LINK) {
      return err(ArtifactErrors.notFound(token));
    }

    return ok(await this.artifactReadRepo.findBySourceNoteId(note.id));
  }
}
