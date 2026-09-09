import { randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { err, type Result } from 'neverthrow';

import { authorizeShareLinkRotation } from '../../domain/access-policy';
import type { NoteEntity } from '../../domain/entities/note.entity';
import {
  NoteErrors,
  type NoteDomainError,
} from '../../domain/errors/note.errors';
import {
  NOTE_READ_REPOSITORY,
  type NoteReadRepository,
} from '../../domain/ports/note-read.repository';
import {
  NOTE_WRITE_REPOSITORY,
  type NoteWriteRepository,
} from '../../domain/ports/note-write.repository';
import { emitAccessChanged } from '../emit-access-changed';

export interface RotateShareLinkInput {
  readonly noteId: string;
  readonly actorId: string;
}

@Injectable()
export class RotateShareLinkHandler {
  constructor(
    @Inject(NOTE_READ_REPOSITORY)
    private readonly noteReader: NoteReadRepository,
    @Inject(NOTE_WRITE_REPOSITORY)
    private readonly noteWriter: NoteWriteRepository,
    private readonly eventEmitter: EventEmitter2
  ) {}

  async execute(
    input: RotateShareLinkInput
  ): Promise<Result<NoteEntity, NoteDomainError>> {
    const note = await this.noteReader.findById(input.noteId);
    if (!note) {
      return err(NoteErrors.noteNotFound(input.noteId));
    }
    const rotation = authorizeShareLinkRotation(note, input.actorId);
    if (rotation.isErr()) {
      return err(rotation.error);
    }
    const result = await this.noteWriter.rotateShareToken({
      noteId: input.noteId,
      ownerId: input.actorId,
      expectedToken: rotation.value,
      newToken: randomBytes(16).toString('hex'),
    });
    if (result.isOk()) {
      emitAccessChanged(this.eventEmitter, input.noteId);
    }
    return result;
  }
}
