import { Module } from '@nestjs/common';

import {
  CreateNoteHandler,
  DeleteNoteHandler,
  GetCollaboratorsHandler,
  GetNoteByTokenHandler,
  GetNoteCountsHandler,
  GetNoteHandler,
  GetNotesHandler,
  RestoreNoteHandler,
  RevokeAccessHandler,
  ShareNoteHandler,
  UpdateNoteHandler,
} from './application';
import { UploadImageHandler } from './application/commands/upload-image.handler';
import {
  NOTE_READ_REPOSITORY,
  NOTE_REPOSITORY,
  NOTE_WRITE_REPOSITORY,
  PERMISSION_REPOSITORY,
} from './domain';
import { IMAGE_STORAGE } from './domain/ports/image-storage.port';
import { NOTE_IMAGE_REPOSITORY } from './domain/ports/note-image.repository';
import { DrizzleNoteRepository } from './infrastructure';
import { DrizzleNoteImageRepository } from './infrastructure/persistence/drizzle-note-image.repository';
import { VercelBlobStorage } from './infrastructure/storage/vercel-blob.storage';
import { NotesController } from './notes.controller';

@Module({
  controllers: [NotesController],
  providers: [
    {
      provide: NOTE_REPOSITORY,
      useClass: DrizzleNoteRepository,
    },
    {
      provide: NOTE_READ_REPOSITORY,
      useExisting: NOTE_REPOSITORY,
    },
    {
      provide: NOTE_WRITE_REPOSITORY,
      useExisting: NOTE_REPOSITORY,
    },
    {
      provide: PERMISSION_REPOSITORY,
      useExisting: NOTE_REPOSITORY,
    },
    CreateNoteHandler,
    UpdateNoteHandler,
    DeleteNoteHandler,
    RestoreNoteHandler,
    GetNoteHandler,
    GetNoteByTokenHandler,
    GetNotesHandler,
    GetNoteCountsHandler,
    ShareNoteHandler,
    RevokeAccessHandler,
    GetCollaboratorsHandler,
    UploadImageHandler,
    { provide: IMAGE_STORAGE, useClass: VercelBlobStorage },
    { provide: NOTE_IMAGE_REPOSITORY, useClass: DrizzleNoteImageRepository },
  ],
  exports: [
    CreateNoteHandler,
    UpdateNoteHandler,
    ShareNoteHandler,
    GetNoteHandler,
    GetNoteByTokenHandler,
    NOTE_REPOSITORY,
    NOTE_READ_REPOSITORY,
  ],
})
export class NotesModule {}
