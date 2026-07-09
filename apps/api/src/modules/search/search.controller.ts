import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  PoliciesGuard,
  RequirePermission,
} from '@jovandyaz/permissions-nestjs';
import { Controller, Get, Inject, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { SUBJECTS } from '@knowtis/authorization';

import {
  RETRIEVAL_PORT,
  type RetrievalPort,
} from '../agent/domain/ports/retrieval.port';
import type { NoteHit } from '../agent/domain/retrieval';
import { RequireMcpScope } from '../mcp/decorators/require-mcp-scope.decorator';
import { MCP_SCOPES } from '../mcp/mcp-token';
import { SearchQueryDto } from './dto/search-query.dto';

const DEFAULT_LIMIT = 20;

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class SearchController {
  constructor(
    @Inject(RETRIEVAL_PORT) private readonly retrieval: RetrievalPort
  ) {}

  @ApiOperation({
    summary: 'Search accessible notes',
    description:
      'Hybrid full-text + semantic search over the notes the user can access. ' +
      'Falls back to keyword search when hybrid retrieval is disabled.',
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        hits: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              title: { type: 'string' },
              updatedAt: { type: 'string', format: 'date-time' },
              isOwner: { type: 'boolean' },
              isSharedWithMe: { type: 'boolean' },
              isPubliclyShared: { type: 'boolean' },
            },
          },
        },
      },
    },
  })
  @Get()
  @RequirePermission('read', SUBJECTS.Note)
  @RequireMcpScope(MCP_SCOPES.READ)
  async search(
    @CurrentUser() user: RequestUser,
    @Query() query: SearchQueryDto
  ): Promise<{ hits: NoteHit[] }> {
    const hits = await this.retrieval.search(user.id, query.q);
    return { hits: hits.slice(0, query.limit ?? DEFAULT_LIMIT) };
  }
}
