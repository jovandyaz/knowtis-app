import { CurrentUser, JwtAuthGuard, Public } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  PoliciesGuard,
  RequirePermission,
} from '@jovandyaz/permissions-nestjs';
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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import type { Result } from 'neverthrow';

import { SUBJECTS } from '@knowtis/authorization';
import { pickDefined } from '@knowtis/shared-util';

import {
  ApiAuthErrors,
  ApiBadRequest,
  ApiForbidden,
  ApiNotFound,
  ApiUnauthorized,
} from '../../core/swagger';
import { RequireMcpScope } from '../mcp/decorators/require-mcp-scope.decorator';
import { McpScopeGuard } from '../mcp/guards/mcp-scope.guard';
import {
  CreateNoteHandler,
  DeleteNoteHandler,
  GetCollaboratorsHandler,
  GetNoteByTokenHandler,
  GetNoteHandler,
  GetNotesHandler,
  RevokeAccessHandler,
  ShareNoteHandler,
  UpdateNoteHandler,
} from './application';
import { NoteErrorCodes, type NoteDomainError } from './domain';
import {
  CreateNoteDto,
  NotesQueryDto,
  ShareNoteDto,
  UpdateNoteDto,
} from './dto';
import { AnonymousNoteLimitGuard } from './guards/anonymous-note-limit.guard';

const NOTE_ERROR_STATUS_MAP: Record<string, HttpStatus> = {
  [NoteErrorCodes.INVALID_TITLE]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.INVALID_CONTENT]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.INVALID_PERMISSION]: HttpStatus.BAD_REQUEST,
  [NoteErrorCodes.NOTE_NOT_FOUND]: HttpStatus.NOT_FOUND,
  [NoteErrorCodes.PERMISSION_DENIED]: HttpStatus.FORBIDDEN,
  [NoteErrorCodes.SHARE_TOKEN_NOT_FOUND]: HttpStatus.NOT_FOUND,
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

const noteProperties = {
  id: { type: 'string', format: 'uuid' },
  title: { type: 'string', example: 'Meeting Notes' },
  content: { type: 'string', example: '<p>Hello world</p>' },
  ownerId: { type: 'string', format: 'uuid' },
  generalAccess: {
    type: 'string',
    enum: ['restricted', 'anyone_with_link'] as string[],
  },
  generalAccessPermission: {
    type: 'string',
    enum: ['viewer', 'editor'] as string[],
  },
  shareToken: { type: 'string', nullable: true },
  editorsCanShare: { type: 'boolean' },
  createdAt: { type: 'string', format: 'date-time' },
  updatedAt: { type: 'string', format: 'date-time' },
};

const noteSchema = { type: 'object' as const, properties: noteProperties };

const noteWithOwnerSchema = {
  type: 'object' as const,
  properties: {
    ...noteProperties,
    owner: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        name: { type: 'string', example: 'John Doe' },
        avatarUrl: { type: 'string', nullable: true },
      },
    },
    accessLevel: {
      type: 'string',
      enum: ['owner', 'editor', 'viewer'] as string[],
    },
  },
};

/**
 * Notes REST API Controller
 */
@ApiTags('Notes')
@ApiBearerAuth()
@Controller('notes')
@UseGuards(JwtAuthGuard, PoliciesGuard, McpScopeGuard)
export class NotesController {
  constructor(
    private readonly createNoteHandler: CreateNoteHandler,
    private readonly getNotesHandler: GetNotesHandler,
    private readonly getNoteHandler: GetNoteHandler,
    private readonly updateNoteHandler: UpdateNoteHandler,
    private readonly deleteNoteHandler: DeleteNoteHandler,
    private readonly shareNoteHandler: ShareNoteHandler,
    private readonly revokeAccessHandler: RevokeAccessHandler,
    private readonly getCollaboratorsHandler: GetCollaboratorsHandler,
    private readonly getNoteByTokenHandler: GetNoteByTokenHandler
  ) {}

  @ApiOperation({
    summary: 'List accessible notes',
    description:
      'Returns all notes owned by or shared with the authenticated user. Optionally filtered by a search term on the title.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of notes with access level',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          ...noteProperties,
          accessLevel: {
            type: 'string',
            enum: ['owner', 'editor', 'viewer'],
          },
        },
      },
    },
  })
  @ApiUnauthorized()
  @Get()
  @RequirePermission('read', SUBJECTS.Note)
  @RequireMcpScope('read')
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

  @ApiOperation({
    summary: 'Get a note by share token',
    description:
      'Returns a note accessible via its share link. Does not require authentication.',
  })
  @ApiParam({
    name: 'token',
    type: 'string',
    description: 'The share token of the note',
  })
  @ApiResponse({
    status: 200,
    description: 'Note retrieved successfully',
    schema: noteWithOwnerSchema,
  })
  @ApiNotFound('share token does not exist')
  @ApiSecurity({})
  @Get('shared/:token')
  @Public()
  async getNoteByToken(@Param('token') token: string) {
    const result = await this.getNoteByTokenHandler.execute(token);
    return unwrapOrThrow(result);
  }

  @ApiOperation({
    summary: 'Get a note by ID',
    description:
      'Returns a specific note if the authenticated user has access to it.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'The UUID of the note',
  })
  @ApiResponse({
    status: 200,
    description: 'Note retrieved successfully',
    schema: noteWithOwnerSchema,
  })
  @ApiUnauthorized()
  @ApiForbidden('user does not have access to this note')
  @ApiNotFound('note does not exist')
  @Get(':id')
  @RequirePermission('read', SUBJECTS.Note)
  @RequireMcpScope('read')
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

  @ApiOperation({
    summary: 'Create a new note',
    description:
      'Creates a new note owned by the authenticated user. Anonymous users have a limit on the number of notes they can create.',
  })
  @ApiBody({ type: CreateNoteDto })
  @ApiResponse({
    status: 201,
    description: 'Note created successfully',
    schema: noteSchema,
  })
  @ApiBadRequest('invalid title or content')
  @ApiAuthErrors('anonymous note limit reached')
  @Post()
  @UseGuards(AnonymousNoteLimitGuard)
  @RequirePermission('create', SUBJECTS.Note)
  @RequireMcpScope('write')
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateNoteDto) {
    const result = await this.createNoteHandler.execute({
      ...(dto.id ? { id: dto.id } : {}),
      title: dto.title,
      ownerId: user.id,
      ...(dto.content ? { content: dto.content } : {}),
    });
    return unwrapOrThrow(result);
  }

  @ApiOperation({
    summary: 'Update a note',
    description:
      'Updates note content and/or sharing settings. Only owners can change sharing settings; editors can update title and content.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'The UUID of the note to update',
  })
  @ApiBody({ type: UpdateNoteDto })
  @ApiResponse({
    status: 200,
    description: 'Note updated successfully',
    schema: noteSchema,
  })
  @ApiBadRequest()
  @ApiAuthErrors('insufficient permissions on this note')
  @ApiNotFound('note does not exist')
  @Patch(':id')
  @RequirePermission('update', SUBJECTS.Note)
  @RequireMcpScope('write')
  async update(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: UpdateNoteDto
  ) {
    const result = await this.updateNoteHandler.execute({
      noteId: id,
      userId: user.id,
      ...pickDefined(dto, [
        'title',
        'content',
        'generalAccess',
        'generalAccessPermission',
        'editorsCanShare',
      ]),
    });
    return unwrapOrThrow(result);
  }

  @ApiOperation({
    summary: 'Delete a note',
    description:
      'Permanently deletes a note. Only the owner can delete a note.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'The UUID of the note to delete',
  })
  @ApiResponse({ status: 204, description: 'Note deleted successfully' })
  @ApiAuthErrors('only the owner can delete a note')
  @ApiNotFound('note does not exist')
  @Delete(':id')
  @RequirePermission('delete', SUBJECTS.Note)
  @RequireMcpScope('write')
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

  @ApiOperation({
    summary: 'Share a note with a user',
    description:
      'Grants a user access to the note with the specified permission level. If the user already has access, their permission is updated.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'The UUID of the note to share',
  })
  @ApiBody({ type: ShareNoteDto })
  @ApiResponse({
    status: 200,
    description: 'Permission granted or updated',
    schema: {
      type: 'object',
      properties: {
        noteId: { type: 'string', format: 'uuid' },
        userId: { type: 'string', format: 'uuid' },
        permission: { type: 'string', enum: ['viewer', 'editor'] },
      },
    },
  })
  @ApiBadRequest()
  @ApiAuthErrors('only the owner can share a note')
  @ApiNotFound('note does not exist')
  @Post(':id/share')
  @RequirePermission('share', SUBJECTS.Note)
  @RequireMcpScope('share')
  async share(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ShareNoteDto
  ) {
    const result = await this.shareNoteHandler.execute({
      noteId: id,
      userId: user.id,
      targetUserId: dto.userId,
      permission: dto.permission,
    });
    return unwrapOrThrow(result);
  }

  @ApiOperation({
    summary: 'Revoke user access to a note',
    description:
      "Removes a specific user's access to the note. Only the note owner can revoke access.",
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'The UUID of the note',
  })
  @ApiParam({
    name: 'userId',
    type: 'string',
    format: 'uuid',
    description: 'The UUID of the user whose access will be revoked',
  })
  @ApiResponse({ status: 204, description: 'Access revoked successfully' })
  @ApiAuthErrors('only the owner can revoke access')
  @ApiNotFound('note does not exist')
  @Delete(':id/share/:userId')
  @RequirePermission('share', SUBJECTS.Note)
  @RequireMcpScope('share')
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

  @ApiOperation({
    summary: 'List note collaborators',
    description:
      'Returns all users who have been granted access to the note, along with their permissions.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'The UUID of the note',
  })
  @ApiResponse({
    status: 200,
    description: 'List of collaborators with permissions',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          permission: {
            type: 'object',
            properties: {
              noteId: { type: 'string', format: 'uuid' },
              userId: { type: 'string', format: 'uuid' },
              permission: { type: 'string', enum: ['viewer', 'editor'] },
            },
          },
          user: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string', example: 'Jane Doe' },
              email: { type: 'string', format: 'email' },
              avatarUrl: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  })
  @ApiAuthErrors('insufficient permissions')
  @ApiNotFound('note does not exist')
  @Get(':id/collaborators')
  @RequirePermission('read', SUBJECTS.Note)
  @RequireMcpScope('read')
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
