import type { RetrievalPort } from '../domain/ports/retrieval.port';
import type { AgentNote, NoteHit, NotesOverview } from '../domain/retrieval';
import type { NoteFixtureSet } from './fixtures/note-sets';

export interface RecordedCall {
  readonly name: string;
  readonly args: unknown;
}

function toHit(note: AgentNote): NoteHit {
  return {
    id: note.id,
    title: note.title,
    updatedAt: note.updatedAt,
    isOwner: note.isOwner,
    isSharedWithMe: note.isSharedWithMe,
    isPubliclyShared: note.isPubliclyShared,
  };
}

export class RecordingFixtureRetrieval implements RetrievalPort {
  private notes: readonly AgentNote[] = [];
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

  async getById(_userId: string, noteId: string): Promise<AgentNote | null> {
    this.calls.push({ name: 'getNote', args: { noteId } });
    return this.notes.find((n) => n.id === noteId) ?? null;
  }

  async listRecent(_userId: string, limit: number): Promise<NoteHit[]> {
    this.calls.push({ name: 'listRecentNotes', args: { limit } });
    return this.notes.slice(0, limit).map(toHit);
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
