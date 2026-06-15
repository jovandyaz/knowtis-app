import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import {
  DATABASE_CONNECTION,
  noteEmbeddings,
  notes,
  type Database,
} from '../../../../database';
import type {
  NoteEmbeddingRepository,
  StaleNote,
  UpsertEmbeddingInput,
} from '../../domain/ports/note-embedding.repository';

@Injectable()
export class DrizzleNoteEmbeddingRepository implements NoteEmbeddingRepository {
  constructor(
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  async findStaleNotes(
    model: string,
    quietSeconds: number,
    limit: number
  ): Promise<StaleNote[]> {
    const rows = await this.db
      .select({
        noteId: notes.id,
        title: notes.title,
        content: notes.content,
        inputHash: noteEmbeddings.inputHash,
      })
      .from(notes)
      .leftJoin(noteEmbeddings, sql`${noteEmbeddings.noteId} = ${notes.id}`)
      .where(
        sql`(${noteEmbeddings.noteId} IS NULL
             OR ${notes.updatedAt} > ${noteEmbeddings.updatedAt}
             OR ${noteEmbeddings.model} <> ${model})
            AND ${notes.updatedAt} < now() - make_interval(secs => ${quietSeconds})`
      )
      .orderBy(notes.updatedAt)
      .limit(limit);
    return rows;
  }

  async upsert(input: UpsertEmbeddingInput): Promise<void> {
    await this.db
      .insert(noteEmbeddings)
      .values({
        noteId: input.noteId,
        embedding: input.embedding,
        model: input.model,
        inputHash: input.inputHash,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: noteEmbeddings.noteId,
        set: {
          embedding: input.embedding,
          model: input.model,
          inputHash: input.inputHash,
          updatedAt: new Date(),
        },
      });
  }

  async touch(noteId: string): Promise<void> {
    await this.db
      .update(noteEmbeddings)
      .set({ updatedAt: new Date() })
      .where(eq(noteEmbeddings.noteId, noteId));
  }
}
