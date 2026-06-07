import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  NOTE_READ_REPOSITORY,
  type NoteReadRepository,
} from '../../../notes/domain/ports/note-read.repository';
import type { RetrievalPort } from '../../domain/ports/retrieval.port';
import type { AgentNote, NoteHit } from '../../domain/retrieval';

@Injectable()
export class KeywordRetrievalAdapter implements RetrievalPort {
  private readonly logger = new Logger(KeywordRetrievalAdapter.name);

  constructor(
    @Inject(NOTE_READ_REPOSITORY)
    private readonly noteReadRepository: NoteReadRepository
  ) {}

  async search(userId: string, query: string): Promise<NoteHit[]> {
    const branded = UserId.create(userId);
    if (branded.isErr()) {
      this.logger.warn(`Invalid userId for retrieval search: ${userId}`);
      return [];
    }
    const rows = await this.noteReadRepository.findAccessibleByUser(
      branded.value,
      query
    );
    return rows.map(({ note }) => ({ id: note.id, title: note.title }));
  }

  async getById(userId: string, noteId: string): Promise<AgentNote | null> {
    const branded = UserId.create(userId);
    if (branded.isErr()) {
      this.logger.warn(`Invalid userId for retrieval getById: ${userId}`);
      return null;
    }
    const rows = await this.noteReadRepository.findAccessibleByUser(
      branded.value
    );
    const match = rows.find(({ note }) => note.id === noteId);
    if (!match) {
      return null;
    }
    return {
      id: match.note.id,
      title: match.note.title,
      content: match.note.content,
    };
  }
}
