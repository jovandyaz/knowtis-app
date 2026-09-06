import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
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
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { SUBJECTS } from '@knowtis/authorization';

import { unwrapOrThrow } from '../../core/http/unwrap-or-throw';
import {
  ApiAuthErrors,
  ApiBadRequest,
  ApiConflict,
  ApiNotFound,
} from '../../core/swagger';
import { RequireMcpScope } from '../mcp/decorators/require-mcp-scope.decorator';
import { MCP_SCOPES } from '../mcp/mcp-token';
import {
  DeleteTagHandler,
  GetTagsHandler,
  UpdateTagHandler,
} from './application';
import { UpdateTagDto } from './dto';
import { NOTE_ERROR_STATUS_MAP } from './notes.constants';

@ApiTags('Tags')
@ApiBearerAuth()
@ApiAuthErrors('caller does not own the tag')
@Controller('tags')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class TagsController {
  constructor(
    private readonly getTagsHandler: GetTagsHandler,
    private readonly updateTagHandler: UpdateTagHandler,
    private readonly deleteTagHandler: DeleteTagHandler
  ) {}

  @ApiOperation({
    summary: "List the caller's tag tree",
    description:
      'Flat list of the tags the caller owns, each with a note count that includes its descendants.',
  })
  @ApiResponse({
    status: 200,
    description: 'The tag tree, ordered by path',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          path: { type: 'string', example: 'work/projects/alpha' },
          color: { type: 'string', nullable: true },
          noteCount: { type: 'integer', example: 12 },
        },
      },
    },
  })
  @Get()
  @RequirePermission('read', SUBJECTS.Note)
  @RequireMcpScope(MCP_SCOPES.READ)
  async getTags(@CurrentUser() user: RequestUser) {
    const result = await this.getTagsHandler.execute({ userId: user.id });
    return unwrapOrThrow(result, NOTE_ERROR_STATUS_MAP);
  }

  @ApiOperation({
    summary: 'Rename or recolor a tag',
    description:
      'Renaming rewrites every descendant path by prefix; the notes carrying the tag are untouched.',
  })
  @ApiResponse({ status: 204, description: 'Tag updated' })
  @ApiBadRequest('tag path is malformed or the colour is not a palette token')
  @ApiNotFound('tag does not exist')
  @ApiConflict('the caller already holds a tag at the target path')
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('update', SUBJECTS.Note)
  async updateTag(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTagDto
  ) {
    const result = await this.updateTagHandler.execute({
      tagId: id,
      userId: user.id,
      ...(dto.path !== undefined ? { path: dto.path } : {}),
      ...(dto.color !== undefined ? { color: dto.color } : {}),
    });
    unwrapOrThrow(result, NOTE_ERROR_STATUS_MAP);
  }

  @ApiOperation({
    summary: 'Delete a tag and its descendants',
    description: 'Notes keep existing; only the tag rows and their links go.',
  })
  @ApiResponse({ status: 204, description: 'Tag deleted' })
  @ApiNotFound('tag does not exist')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('delete', SUBJECTS.Note)
  async deleteTag(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string
  ) {
    const result = await this.deleteTagHandler.execute({
      tagId: id,
      userId: user.id,
    });
    unwrapOrThrow(result, NOTE_ERROR_STATUS_MAP);
  }
}
