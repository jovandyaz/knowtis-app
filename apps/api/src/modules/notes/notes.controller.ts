import { CurrentUser, JwtAuthGuard, Public } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  PoliciesGuard,
  RequirePermission,
} from '@jovandyaz/permissions-nestjs';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  HttpCode,
  HttpStatus,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { SUBJECTS } from '@knowtis/authorization';
import {
  DEFAULT_NOTES_PAGE_SIZE,
  PARA_BUCKETS,
  SUPERTAG_CATALOG,
  SUPERTAGS,
} from '@knowtis/shared-types';
import { pickDefined } from '@knowtis/shared-util';

import { unwrapOrThrow } from '../../core/http/unwrap-or-throw';
import {
  ApiAuthErrors,
  ApiBadRequest,
  ApiForbidden,
  ApiNotFound,
  ApiUnauthorized,
} from '../../core/swagger';
import { RequireMcpScope } from '../mcp/decorators/require-mcp-scope.decorator';
import { MCP_SCOPES } from '../mcp/mcp-token';
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
import { RotateShareLinkHandler } from './application/commands/rotate-share-link.handler';
import { UploadImageHandler } from './application/commands/upload-image.handler';
import { toNoteView } from './domain';
import {
  CreateNoteDto,
  NotesQueryDto,
  ShareNoteDto,
  UpdateNoteDto,
} from './dto';
import { UploadImageDto } from './dto/upload-image.dto';
import { AnonymousNoteLimitGuard } from './guards/anonymous-note-limit.guard';
import { sanitizeFilename } from './infrastructure/filename.util';
import { NOTE_ERROR_STATUS_MAP, NOTE_UPDATE_THROTTLE } from './notes.constants';

const notePersonSchema = {
  type: 'object' as const,
  required: ['user', 'permission'],
  properties: {
    permission: {
      type: 'string' as const,
      enum: ['owner', 'viewer', 'editor'],
    },
    user: {
      type: 'object' as const,
      required: ['id', 'name', 'email', 'avatarUrl'],
      properties: {
        id: { type: 'string' as const, format: 'uuid' },
        name: { type: 'string' as const },
        email: { type: 'string' as const, format: 'email' },
        avatarUrl: { type: 'string' as const, nullable: true },
      },
    },
  },
};

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
  bucket: {
    type: 'string',
    nullable: true,
    enum: [...PARA_BUCKETS] as string[],
  },
  supertag: {
    type: 'string',
    nullable: true,
    enum: [...SUPERTAGS] as string[],
  },
  supertagFields: { type: 'object', nullable: true },
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
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class NotesController {
  constructor(
    private readonly createNoteHandler: CreateNoteHandler,
    private readonly getNotesHandler: GetNotesHandler,
    private readonly getNoteCountsHandler: GetNoteCountsHandler,
    private readonly getNoteHandler: GetNoteHandler,
    private readonly updateNoteHandler: UpdateNoteHandler,
    private readonly deleteNoteHandler: DeleteNoteHandler,
    private readonly restoreNoteHandler: RestoreNoteHandler,
    private readonly shareNoteHandler: ShareNoteHandler,
    private readonly revokeAccessHandler: RevokeAccessHandler,
    private readonly getCollaboratorsHandler: GetCollaboratorsHandler,
    private readonly getNoteByTokenHandler: GetNoteByTokenHandler,
    private readonly uploadImageHandler: UploadImageHandler,
    private readonly rotateShareLinkHandler: RotateShareLinkHandler
  ) {}

  @ApiOperation({
    summary: 'List accessible notes',
    description:
      'Returns a page of notes owned by or shared with the authenticated user, newest first. Optionally filtered by a search term, a PARA bucket, and an owned/shared view.',
  })
  @ApiResponse({
    status: 200,
    description: 'Page of notes with access level',
    schema: {
      type: 'object',
      properties: {
        items: {
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
        total: { type: 'integer', example: 287 },
        page: { type: 'integer', example: 1 },
        limit: { type: 'integer', example: DEFAULT_NOTES_PAGE_SIZE },
      },
    },
  })
  @ApiUnauthorized()
  @Get()
  @RequirePermission('read', SUBJECTS.Note)
  @RequireMcpScope(MCP_SCOPES.READ)
  async findAll(
    @CurrentUser() user: RequestUser,
    @Query() query: NotesQueryDto
  ) {
    const result = await this.getNotesHandler.execute({
      userId: user.id,
      page: query.page ?? 1,
      limit: query.limit ?? DEFAULT_NOTES_PAGE_SIZE,
      ...(query.search ? { search: query.search } : {}),
      ...(query.bucket ? { bucket: query.bucket } : {}),
      ...(query.view ? { view: query.view } : {}),
      ...(query.tag ? { tag: query.tag } : {}),
      ...(query.supertag ? { supertag: query.supertag } : {}),
    });
    return unwrapOrThrow(result, NOTE_ERROR_STATUS_MAP);
  }

  @ApiOperation({
    summary: 'Get the note type catalog',
    description:
      'Static field descriptors per type. Consumers derive their own validator, form or tool schema from these.',
  })
  @ApiResponse({ status: 200, description: 'Field descriptors keyed by type' })
  @Get('supertags')
  @RequirePermission('read', SUBJECTS.Note)
  @RequireMcpScope(MCP_SCOPES.READ)
  getSupertags() {
    return SUPERTAG_CATALOG;
  }

  @ApiOperation({
    summary: 'Get accessible note counts per PARA bucket and type',
  })
  @ApiResponse({
    status: 200,
    description: 'Counts grouped by bucket',
    schema: {
      type: 'object',
      properties: {
        inbox: { type: 'integer', example: 12 },
        projects: { type: 'integer', example: 4 },
        areas: { type: 'integer', example: 2 },
        resources: { type: 'integer', example: 7 },
        archive: { type: 'integer', example: 1 },
        supertags: {
          type: 'object',
          additionalProperties: { type: 'integer' },
        },
      },
    },
  })
  @Get('counts')
  @RequirePermission('read', SUBJECTS.Note)
  @RequireMcpScope(MCP_SCOPES.READ)
  async getCounts(@CurrentUser() user: RequestUser) {
    const result = await this.getNoteCountsHandler.execute({
      userId: user.id,
    });
    return unwrapOrThrow(result, NOTE_ERROR_STATUS_MAP);
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
    return unwrapOrThrow(result, NOTE_ERROR_STATUS_MAP);
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
  @RequireMcpScope(MCP_SCOPES.READ)
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.getNoteHandler.execute({
      noteId: id,
      userId: user.id,
    });
    return unwrapOrThrow(result, NOTE_ERROR_STATUS_MAP);
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
  @RequireMcpScope(MCP_SCOPES.WRITE)
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateNoteDto) {
    const result = await this.createNoteHandler.execute({
      ...(dto.id ? { id: dto.id } : {}),
      title: dto.title,
      ownerId: user.id,
      ...(dto.content ? { content: dto.content } : {}),
    });
    return unwrapOrThrow(result.map(toNoteView), NOTE_ERROR_STATUS_MAP);
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
  @Throttle(NOTE_UPDATE_THROTTLE)
  @RequirePermission('update', SUBJECTS.Note)
  @RequireMcpScope(MCP_SCOPES.WRITE)
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
        'yjsState',
        'generalAccess',
        'generalAccessPermission',
        'editorsCanShare',
        'bucket',
        'tags',
        'supertag',
        'supertagFields',
      ]),
    });
    return unwrapOrThrow(result.map(toNoteView), NOTE_ERROR_STATUS_MAP);
  }

  @ApiOperation({
    summary: 'Delete a note',
    description:
      'Soft-deletes a note (recoverable via restore). Only the owner can delete a note.',
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
  @RequireMcpScope(MCP_SCOPES.WRITE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.deleteNoteHandler.execute({
      noteId: id,
      userId: user.id,
    });
    return unwrapOrThrow(result, NOTE_ERROR_STATUS_MAP);
  }

  @ApiOperation({
    summary: 'Restore a soft-deleted note',
    description:
      'Restores a previously soft-deleted note. Only the owner can restore.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'The UUID of the note to restore',
  })
  @ApiResponse({
    status: 200,
    description: 'Note restored successfully',
    schema: noteSchema,
  })
  @ApiAuthErrors('only the owner can restore a note')
  @ApiNotFound('note does not exist or is not deleted')
  @Post(':id/restore')
  @RequirePermission('delete', SUBJECTS.Note)
  @RequireMcpScope(MCP_SCOPES.WRITE)
  async restore(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.restoreNoteHandler.execute({
      noteId: id,
      userId: user.id,
    });
    return unwrapOrThrow(result.map(toNoteView), NOTE_ERROR_STATUS_MAP);
  }

  @ApiOperation({
    summary: 'Add or update a person by exact email',
    description:
      'Owner or direct editors with sharing enabled can manage people. Widening access requires verified identity when the verification gate is enabled.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiBody({ type: ShareNoteDto })
  @ApiResponse({
    status: 201,
    description: 'Person added or updated',
    schema: notePersonSchema,
  })
  @ApiResponse({
    status: 422,
    description: 'PERSON_NOT_ADDABLE: this person cannot be added or changed',
  })
  @ApiBadRequest()
  @ApiAuthErrors(
    'only the owner or a direct editor with sharing enabled can manage people'
  )
  @ApiNotFound('note does not exist')
  @Post(':id/share')
  @RequirePermission('share', SUBJECTS.Note)
  @RequireMcpScope(MCP_SCOPES.SHARE)
  async share(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: ShareNoteDto
  ) {
    const result = await this.shareNoteHandler.execute({
      noteId: id,
      userId: user.id,
      email: dto.email,
      permission: dto.permission,
    });
    return unwrapOrThrow(result, NOTE_ERROR_STATUS_MAP);
  }

  @ApiOperation({
    summary: 'Rotate the share link',
    description:
      'Owner only. Available while restricted and without verified email. Takes an empty body. Returns the persisted note; open sessions revalidate separately.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Share link rotated',
    schema: noteSchema,
  })
  @ApiResponse({
    status: 409,
    description:
      'SHARE_LINK_CONFLICT: link absent or a concurrent rotation won',
  })
  @ApiBadRequest('the request body must be empty')
  @ApiAuthErrors('only the owner can rotate the share link')
  @ApiNotFound('note does not exist')
  @Post(':id/share-link/rotate')
  @Throttle(NOTE_UPDATE_THROTTLE)
  @RequirePermission('share', SUBJECTS.Note)
  @RequireMcpScope(MCP_SCOPES.SHARE)
  @HttpCode(HttpStatus.OK)
  async rotateShareLink(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: unknown
  ) {
    if (
      body !== undefined &&
      (body === null ||
        typeof body !== 'object' ||
        Array.isArray(body) ||
        Object.keys(body).length > 0)
    ) {
      throw new BadRequestException('The request body must be empty');
    }
    const result = await this.rotateShareLinkHandler.execute({
      noteId: id,
      actorId: user.id,
    });
    return unwrapOrThrow(result.map(toNoteView), NOTE_ERROR_STATUS_MAP);
  }

  @ApiOperation({
    summary: 'Revoke user access to a note',
    description:
      "Removes a specific user's access to the note. The owner or a direct editor with sharing enabled can revoke non-owner access.",
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
  @ApiAuthErrors(
    'only the owner or a direct editor with sharing enabled can revoke access'
  )
  @ApiNotFound('note does not exist')
  @Delete(':id/share/:userId')
  @RequirePermission('share', SUBJECTS.Note)
  @RequireMcpScope(MCP_SCOPES.SHARE)
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeAccess(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.revokeAccessHandler.execute({
      noteId: id,
      userId: user.id,
      targetUserId: userId,
    });
    return unwrapOrThrow(result, NOTE_ERROR_STATUS_MAP);
  }

  @ApiOperation({ summary: 'Upload an image to a note' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        width: { type: 'integer' },
        height: { type: 'integer' },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Uploaded image metadata',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', format: 'uuid' },
        url: {
          type: 'string',
          example:
            'https://<store>.public.blob.vercel-storage.com/notes/<id>/photo-abc.webp',
        },
        width: { type: 'integer', nullable: true },
        height: { type: 'integer', nullable: true },
      },
    },
  })
  @ApiBadRequest('invalid image file (type or size)')
  @ApiAuthErrors('insufficient permissions on this note')
  @ApiNotFound('note does not exist')
  @Post(':id/images')
  @Throttle(NOTE_UPDATE_THROTTLE)
  @RequirePermission('update', SUBJECTS.Note)
  @RequireMcpScope(MCP_SCOPES.WRITE)
  @UseInterceptors(FileInterceptor('file'))
  async uploadImage(
    @Param('id', ParseUUIDPipe) noteId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }),
          new FileTypeValidator({
            fileType: /^image\/(png|jpe?g|gif|webp)$/,
            skipMagicNumbersValidation: true,
          }),
        ],
      })
    )
    file: Express.Multer.File,
    @Body() dto: UploadImageDto,
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.uploadImageHandler.execute({
      noteId,
      userId: user.id,
      filename: sanitizeFilename(file.originalname),
      data: file.buffer,
      contentType: file.mimetype,
      size: file.size,
      ...(dto.width !== undefined && { width: dto.width }),
      ...(dto.height !== undefined && { height: dto.height }),
    });
    return unwrapOrThrow(result, NOTE_ERROR_STATUS_MAP);
  }

  @ApiOperation({
    summary: 'List people with direct note access',
    description:
      'Owner first, followed by direct collaborators. Available to the owner or direct editors with sharing enabled.',
  })
  @ApiParam({ name: 'id', type: 'string', format: 'uuid' })
  @ApiResponse({
    status: 200,
    schema: { type: 'array', items: notePersonSchema },
  })
  @ApiAuthErrors('insufficient permissions')
  @ApiNotFound('note does not exist')
  @Get(':id/collaborators')
  @RequirePermission('read', SUBJECTS.Note)
  @RequireMcpScope(MCP_SCOPES.READ)
  async getCollaborators(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: RequestUser
  ) {
    const result = await this.getCollaboratorsHandler.execute({
      noteId: id,
      userId: user.id,
    });
    return unwrapOrThrow(result, NOTE_ERROR_STATUS_MAP);
  }
}
