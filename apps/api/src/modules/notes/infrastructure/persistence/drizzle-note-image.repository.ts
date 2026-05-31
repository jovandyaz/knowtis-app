import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  DATABASE_CONNECTION,
  noteImages,
  type Database,
} from '../../../../database';
import type { NewNoteImage, NoteImage } from '../../../../database/schema';
import type { NoteImageRepository } from '../../domain/ports/note-image.repository';

@Injectable()
export class DrizzleNoteImageRepository implements NoteImageRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async create(data: NewNoteImage): Promise<NoteImage> {
    const [row] = await this.db.insert(noteImages).values(data).returning();
    return row;
  }

  async findPathnamesByNote(noteId: string): Promise<string[]> {
    const rows = await this.db
      .select({ pathname: noteImages.pathname })
      .from(noteImages)
      .where(eq(noteImages.noteId, noteId));
    return rows.map((r) => r.pathname);
  }
}
