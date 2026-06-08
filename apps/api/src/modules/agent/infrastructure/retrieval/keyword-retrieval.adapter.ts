import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';

import {
  NOTE_READ_REPOSITORY,
  type NoteReadRepository,
} from '../../../notes/domain/ports/note-read.repository';
import type { RetrievalPort } from '../../domain/ports/retrieval.port';
import type { AgentNote, NoteHit } from '../../domain/retrieval';

const MAX_SEARCH_HITS = 20;

@Injectable()
export class KeywordRetrievalAdapter implements RetrievalPort {
  private readonly logger = new Logger(KeywordRetrievalAdapter.name);

  constructor(
    @Inject(NOTE_READ_REPOSITORY)
    private readonly noteReadRepository: NoteReadRepository
  ) {}

  async search(userId: string, query: string): Promise<NoteHit[]> {
    const branded = this.brandUser(userId, 'search');
    if (!branded) {
      return [];
    }
    const rows = await this.noteReadRepository.findAccessibleByUser(
      branded,
      query
    );
    return rows
      .slice(0, MAX_SEARCH_HITS)
      .map(({ note }) => ({ id: note.id, title: note.title }));
  }

  async getById(userId: string, noteId: string): Promise<AgentNote | null> {
    const branded = this.brandUser(userId, 'getById');
    if (!branded) {
      return null;
    }
    // Access-scope first, then match the id, so a model-supplied noteId can't
    // reach a note the user can't read. A3 swaps this scan for an indexed lookup.
    const rows = await this.noteReadRepository.findAccessibleByUser(branded);
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

  private brandUser(userId: string, op: string): UserId | null {
    const branded = UserId.create(userId);
    if (branded.isErr()) {
      this.logger.warn(`Invalid userId for retrieval ${op}: ${userId}`);
      return null;
    }
    return branded.value;
  }
}
