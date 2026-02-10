import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { Result } from 'neverthrow';

import type { RequestUser } from '@knowtis/shared-types';

import { CurrentUser, JwtAuthGuard } from '../auth';
import {
  CreateNoteHandler,
  DeleteNoteHandler,
  GetCollaboratorsHandler,
  GetNoteHandler,
  GetNotesHandler,
  RevokeAccessHandler,
  ShareNoteHandler,
  UpdateNoteHandler,
} from './application';
import { NoteErrorCodes, type NoteDomainError } from './domain';
import type {
  CreateNoteDto,
  NotesQueryDto,
  ShareNoteDto,
  UpdateNoteDto,
} from './dto';

const NOTE_ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [NoteErrorCodes.INVALID_TITLE]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.INVALID_CONTENT]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.INVALID_PERMISSION]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.NOTE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [NoteErrorCodes.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [NoteErrorCodes.INTERNAL_ERROR]: HttpStatus.INTERNAL_SERVER_ERROR,
};

function unwrapOrThrow<T>(result: Result<T, NoteDomainError>): T {
  if (result.isErr()) {
    const status =
      NOTE_ERROR_STATUS_MAP[result.error.code] ?? HttpStatus.BAD_REQUEST;
    throw new HttpException(
      {
        statusCode: status,
        error: result.error.code,
        message: result.error.message,
      },
      status
    );
  }
  return result.value;
}

@Controller('notes')
@UseGuards(JwtAuthGuard)
export class NotesController {
  constructor(
    private readonly createNoteHandler: CreateNoteHandler,
    private readonly getNotesHandler: GetNotesHandler,
    private readonly getNoteHandler: GetNoteHandler,
    private readonly updateNoteHandler: UpdateNoteHandler,
    private readonly deleteNoteHandler: DeleteNoteHandler,
    private readonly shareNoteHandler: ShareNoteHandler,
    private readonly revokeAccessHandler: RevokeAccessHandler,
    private readonly getCollaboratorsHandler: GetCollaboratorsHandler
  ) {}

  @Get()
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: NotesQueryDto
  ) {
    const result = await this.getNotesHandler.execute({
      userId: user.id,
      ...(query.search ? { search: query.search } : {}),
    });
    return unwrapOrThrow(result);
  }

  @Get(':id')
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.getNoteHandler.execute({
      noteId: id,
      userId: user.id,
    });
    return unwrapOrThrow(result);
  }

  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateNoteDto) {
    const result = await this.createNoteHandler.execute({
      title: dto.title,
      ownerId: user.id,
      ...(dto.content ? { content: dto.content } : {}),
    });
    return unwrapOrThrow(result);
  }

  @Patch(':id')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateNoteDto
  ) {
    const result = await this.updateNoteHandler.execute({
      noteId: id,
      userId: user.id,
      ...(dto.title ? { title: dto.title } : {}),
      ...(dto.content ? { content: dto.content } : {}),
      ...(dto.isPublic !== undefined ? { isPublic: dto.isPublic } : {}),
    });
    return unwrapOrThrow(result);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.deleteNoteHandler.execute({
      noteId: id,
      userId: user.id,
    });
    return unwrapOrThrow(result);
  }

  @Post(':id/share')
  async share(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ShareNoteDto
  ) {
    const result = await this.shareNoteHandler.execute({
      noteId: id,
      ownerId: user.id,
      targetUserId: dto.userId,
      permission: dto.permission,
    });
    return unwrapOrThrow(result);
  }

  @Delete(':id/share/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.revokeAccessHandler.execute({
      noteId: id,
      ownerId: user.id,
      targetUserId: userId,
    });
    return unwrapOrThrow(result);
  }

  @Get(':id/collaborators')
  async getCollaborators(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.getCollaboratorsHandler.execute({
      noteId: id,
      userId: user.id,
    });
    return unwrapOrThrow(result);
  }
}
