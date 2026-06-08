import { UserId } from '@jovandyaz/auth/server';
import { Inject, Injectable, Logger } from '@nestjs/common';

import type { NoteEntity } from '../../../notes/domain/entities/note.entity';
import {
  NOTE_READ_REPOSITORY,
  type NoteReadRepository,
} from '../../../notes/domain/ports/note-read.repository';
import type { RetrievalPort } from '../../domain/ports/retrieval.port';
import type {
  AgentNote,
  NoteHit,
  NoteMeta,
  NotesOverview,
} from '../../domain/retrieval';

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
    return rows.slice(0, MAX_SEARCH_HITS).map(({ note }) => ({
      id: note.id,
      title: note.title,
      ...this.toMeta(note, userId),
    }));
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
      createdAt: match.note.createdAt.toISOString(),
      ...this.toMeta(match.note, userId),
    };
  }

  async listRecent(userId: string, limit: number): Promise<NoteHit[]> {
    const branded = this.brandUser(userId, 'listRecent');
    if (!branded) {
      return [];
    }
    const clampedLimit = Math.min(Math.max(limit, 1), MAX_SEARCH_HITS);
    const rows = await this.noteReadRepository.findAccessibleByUser(branded);
    return rows
      .slice()
      .sort((a, b) => b.note.updatedAt.getTime() - a.note.updatedAt.getTime())
      .slice(0, clampedLimit)
      .map(({ note }) => ({
        id: note.id,
        title: note.title,
        ...this.toMeta(note, userId),
      }));
  }

  async overview(userId: string): Promise<NotesOverview> {
    const branded = this.brandUser(userId, 'overview');
    if (!branded) {
      return { total: 0, owned: 0, sharedWithMe: 0 };
    }
    const rows = await this.noteReadRepository.findAccessibleByUser(branded);
    const total = rows.length;
    const owned = rows.filter((r) => r.note.ownerId === userId).length;
    return { total, owned, sharedWithMe: total - owned };
  }

  private toMeta(note: NoteEntity, userId: string): NoteMeta {
    return {
      updatedAt: note.updatedAt.toISOString(),
      isOwner: note.ownerId === userId,
      isSharedWithMe: note.ownerId !== userId,
      isPubliclyShared:
        note.generalAccess !== 'restricted' || note.shareToken !== null,
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
