import { markdownToHtml } from '@knowtis/note-markdown';

import type { RetrievalPort } from '../domain/ports/retrieval.port';
import type {
  AgentNote,
  NoteBody,
  NoteHit,
  NotesOverview,
} from '../domain/retrieval';
import type { NoteFixture, NoteFixtureSet } from './fixtures/note-sets';

export interface RecordedCall {
  readonly name: string;
  readonly args: unknown;
}

function toHit(note: NoteFixture): NoteHit {
  return {
    id: note.id,
    title: note.title,
    updatedAt: note.updatedAt,
    isOwner: note.isOwner,
    isSharedWithMe: note.isSharedWithMe,
    isPubliclyShared: note.isPubliclyShared,
  };
}

function toAgentNote(note: NoteFixture): AgentNote {
  return {
    ...toHit(note),
    content: note.content,
    contentStatus: note.contentStatus,
    createdAt: note.createdAt,
  };
}

export class RecordingFixtureRetrieval implements RetrievalPort {
  private notes: NoteFixtureSet = [];
  private calls: RecordedCall[] = [];

  seed(set: NoteFixtureSet): void {
    this.notes = set;
    this.calls = [];
  }

  getCalls(): RecordedCall[] {
    return [...this.calls];
  }

  async search(_userId: string, query: string): Promise<NoteHit[]> {
    this.calls.push({ name: 'searchNotes', args: { query } });
    const needle = query.toLowerCase();
    return this.notes
      .filter(
        (n) =>
          n.title.toLowerCase().includes(needle) ||
          n.content.toLowerCase().includes(needle)
      )
      .map(toHit);
  }

  async listUnindexed(): Promise<NoteHit[]> {
    return [];
  }

  async getById(_userId: string, noteId: string): Promise<AgentNote | null> {
    this.calls.push({ name: 'getNote', args: { noteId } });
    const fixture = this.notes.find((n) => n.id === noteId);
    return fixture ? toAgentNote(fixture) : null;
  }

  // No model tool call reaches getBody, so recording it would put a phantom
  // getNote in the transcript the eval asserts against.
  async getBody(_userId: string, noteId: string): Promise<NoteBody | null> {
    const fixture = this.notes.find((n) => n.id === noteId);
    if (!fixture) {
      return null;
    }
    return {
      title: fixture.title,
      html: markdownToHtml(fixture.body ?? fixture.content),
      updatedAt: fixture.updatedAt,
    };
  }

  async listRecent(_userId: string, limit: number): Promise<NoteHit[]> {
    this.calls.push({ name: 'listRecentNotes', args: { limit } });
    return [...this.notes]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, Math.max(limit, 0))
      .map(toHit);
  }

  async overview(_userId: string): Promise<NotesOverview> {
    this.calls.push({ name: 'getNotesOverview', args: {} });
    return {
      total: this.notes.length,
      owned: this.notes.filter((n) => n.isOwner).length,
      sharedWithMe: this.notes.filter((n) => n.isSharedWithMe).length,
    };
  }
}
