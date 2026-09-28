import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  PoliciesGuard,
  RequirePermission,
} from '@jovandyaz/permissions-nestjs';
import { Controller, Get, Inject, Query, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import { estimateTokenCount } from '@knowtis/ai-gateway';
import { SUBJECTS } from '@knowtis/authorization';

import { clientIpOf } from '../../core/http/client-ip';
import {
  RETRIEVAL_PORT,
  type RetrievalPort,
} from '../agent/domain/ports/retrieval.port';
import type { NoteHit } from '../agent/domain/retrieval';
import { AIRateLimitService } from '../ai/application/services/ai-rate-limit.service';
import { TierResolver } from '../ai/application/services/tier-resolver.service';
import {
  EMBEDDING_PORT,
  type EmbeddingPort,
} from '../ai/domain/ports/embedding.port';
import { RequireMcpScope } from '../mcp/decorators/require-mcp-scope.decorator';
import { MCP_SCOPES } from '../mcp/mcp-token';
import { SearchQueryDto } from './dto/search-query.dto';

const DEFAULT_LIMIT = 20;

type SearchMode = 'hybrid' | 'lexical';

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class SearchController {
  constructor(
    @Inject(RETRIEVAL_PORT) private readonly retrieval: RetrievalPort,
    @Inject(EMBEDDING_PORT) private readonly embedding: EmbeddingPort,
    private readonly rateLimit: AIRateLimitService,
    private readonly tierResolver: TierResolver
  ) {}

  @ApiOperation({
    summary: 'Search accessible notes',
    description:
      'Hybrid full-text + semantic search over the notes the user can access. ' +
      'Runs full-text only when no embedding provider is configured, when ' +
      'the AI budget refuses the embed leg, or when hybrid retrieval fails.',
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
        mode: {
          type: 'string',
          enum: ['hybrid', 'lexical'],
          description:
            "Whether the semantic leg was attempted, not whether it succeeded. 'lexical' means it was skipped because no embedding provider is configured or the AI budget refused it; 'hybrid' means it was attempted (it may still fall back to lexical results internally on failure).",
        },
      },
    },
  })
  @Get()
  @RequirePermission('read', SUBJECTS.Note)
  @RequireMcpScope(MCP_SCOPES.READ)
  async search(
    @CurrentUser() user: RequestUser,
    @Query() query: SearchQueryDto,
    @Req() req: Request
  ): Promise<{ hits: NoteHit[]; mode: SearchMode }> {
    const execution = await this.tierResolver.resolve({
      userId: user.id,
      isAnonymous: user.isAnonymous === true,
      clientIp: clientIpOf(req),
    });
    const check = this.embedding.isConfigured()
      ? await this.rateLimit.checkLimit(execution, {
          tokens: estimateTokenCount(query.q),
          costUsd: 0,
        })
      : null;
    const semantic = check?.allowed === true;
    try {
      const hits = await this.retrieval.search(execution, query.q, {
        semantic,
      });
      return {
        hits: hits.slice(0, query.limit ?? DEFAULT_LIMIT),
        mode: semantic ? 'hybrid' : 'lexical',
      };
    } finally {
      if (check?.allowed) {
        await this.rateLimit.releaseReservation(execution, check.reservation);
      }
    }
  }
}
