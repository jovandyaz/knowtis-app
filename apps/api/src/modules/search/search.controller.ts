import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  PoliciesGuard,
  RequirePermission,
} from '@jovandyaz/permissions-nestjs';
import {
  Controller,
  Get,
  HttpStatus,
  Inject,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';
import { err, ok } from 'neverthrow';

import { estimateTokenCount } from '@knowtis/ai-gateway';
import { SUBJECTS } from '@knowtis/authorization';

import { clientIpOf } from '../../core/http/client-ip';
import { unwrapOrThrow } from '../../core/http/unwrap-or-throw';
import {
  RETRIEVAL_PORT,
  type RetrievalPort,
} from '../agent/domain/ports/retrieval.port';
import type { NoteHit } from '../agent/domain/retrieval';
import { AIRateLimitService } from '../ai/application/services/ai-rate-limit.service';
import { AIErrorCodes, AIErrors } from '../ai/domain/errors/ai.errors';
import { RequireMcpScope } from '../mcp/decorators/require-mcp-scope.decorator';
import { MCP_SCOPES } from '../mcp/mcp-token';
import { SearchQueryDto } from './dto/search-query.dto';

const DEFAULT_LIMIT = 20;

const RATE_LIMIT_STATUS_MAP: Record<string, HttpStatus> = {
  [AIErrorCodes.RATE_LIMIT_EXCEEDED]: HttpStatus.TOO_MANY_REQUESTS,
};

@ApiTags('Search')
@ApiBearerAuth()
@Controller('search')
@UseGuards(JwtAuthGuard, PoliciesGuard)
export class SearchController {
  constructor(
    @Inject(RETRIEVAL_PORT) private readonly retrieval: RetrievalPort,
    private readonly rateLimit: AIRateLimitService
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
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: 'AI rate or budget limit exceeded',
  })
  @Get()
  @RequirePermission('read', SUBJECTS.Note)
  @RequireMcpScope(MCP_SCOPES.READ)
  async search(
    @CurrentUser() user: RequestUser,
    @Query() query: SearchQueryDto,
    @Req() req: Request
  ): Promise<{ hits: NoteHit[] }> {
    const estimatedTokens = estimateTokenCount(query.q);
    const check = await this.rateLimit.checkLimit(
      user.id,
      estimatedTokens,
      user.isAnonymous === true,
      false,
      0,
      clientIpOf(req)
    );
    const reservation = unwrapOrThrow(
      check.allowed ? ok(check) : err(AIErrors.rateLimitExceeded(check.reason)),
      RATE_LIMIT_STATUS_MAP
    );
    try {
      const hits = await this.retrieval.search(user.id, query.q);
      return { hits: hits.slice(0, query.limit ?? DEFAULT_LIMIT) };
    } finally {
      void this.rateLimit.releaseReservation(
        user.id,
        estimatedTokens,
        0,
        reservation.reservedIpSubject
      );
    }
  }
}
