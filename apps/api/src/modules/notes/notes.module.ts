import { Module } from '@nestjs/common';

import {
  CreateNoteHandler,
  DeleteNoteHandler,
  DeleteTagHandler,
  GetCollaboratorsHandler,
  GetNoteByTokenHandler,
  GetNoteCountsHandler,
  GetNoteHandler,
  GetNotesHandler,
  GetTagsHandler,
  RestoreNoteHandler,
  RevokeAccessHandler,
  ShareNoteHandler,
  UpdateNoteHandler,
  UpdateTagHandler,
} from './application';
import { UploadImageHandler } from './application/commands/upload-image.handler';
import {
  NOTE_READ_REPOSITORY,
  NOTE_REPOSITORY,
  NOTE_WRITE_REPOSITORY,
  PERMISSION_REPOSITORY,
  TAG_REPOSITORY,
} from './domain';
import { IMAGE_STORAGE } from './domain/ports/image-storage.port';
import { NOTE_IMAGE_REPOSITORY } from './domain/ports/note-image.repository';
import { DrizzleNoteRepository } from './infrastructure';
import { DrizzleNoteImageRepository } from './infrastructure/persistence/drizzle-note-image.repository';
import { DrizzleTagRepository } from './infrastructure/persistence/drizzle-tag.repository';
import { VercelBlobStorage } from './infrastructure/storage/vercel-blob.storage';
import { NotesController } from './notes.controller';
import { TagsController } from './tags.controller';

@Module({
  controllers: [NotesController, TagsController],
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
    {
      provide: TAG_REPOSITORY,
      useClass: DrizzleTagRepository,
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
    GetTagsHandler,
    UpdateTagHandler,
    DeleteTagHandler,
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
    TAG_REPOSITORY,
  ],
})
export class NotesModule {}
