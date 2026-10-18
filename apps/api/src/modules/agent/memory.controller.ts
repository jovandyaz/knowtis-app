import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Req,
  UnprocessableEntityException,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import type { Request } from 'express';

import {
  AGENT_MEMORY_REJECTED_CODE,
  AGENT_MEMORY_UNAVAILABLE_CODE,
  MEMORY_EDIT_REJECTION_REASONS,
  MEMORY_EDIT_UNAVAILABLE_REASONS,
  MEMORY_MAX_CHARS,
  type MemoryEditUnavailableReason,
  type UserMemoryItem,
} from '@knowtis/shared-types';

import type { EnvConfig } from '../../config/env.config';
import { clientIpOf } from '../../core/http/client-ip';
import { SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS } from '../../core/http/retry-after.header';
import {
  ApiBadRequest,
  ApiNotFound,
  ApiServiceUnavailable,
  ApiUnauthorized,
} from '../../core/swagger/api-responses.decorator';
import { AiUnavailableExceptionFilter } from '../ai/ai-unavailable.filter';
import { TierResolver } from '../ai/application/services/tier-resolver.service';
import { AIErrorCodes, AIErrors } from '../ai/domain/errors/ai.errors';
import {
  EDIT_MEMORY_OUTCOME,
  EditMemoryHandler,
} from './application/edit-memory.handler';
import { isRecallableMemory } from './domain/memory-content-policy';
import {
  MEMORY_REPOSITORY,
  type MemoryRepository,
  type StoredMemory,
} from './domain/ports/memory.repository';
import { EditMemoryDto } from './dto/edit-memory.dto';
import {
  MemoryUnavailableException,
  MemoryUnavailableExceptionFilter,
} from './memory-unavailable.filter';

const MEMORY_NOT_FOUND_MESSAGE = 'Memory not found';
const RETRY_AFTER_SECONDS_BY_REASON = {
  screening_unavailable: SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS,
  embeddings_failed: SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS,
  embeddings_unavailable: null,
} as const satisfies Record<MemoryEditUnavailableReason, number | null>;
const RETRYABLE_REASONS = MEMORY_EDIT_UNAVAILABLE_REASONS.filter(
  (reason) => RETRY_AFTER_SECONDS_BY_REASON[reason] !== null
);
const FINAL_REASONS = MEMORY_EDIT_UNAVAILABLE_REASONS.filter(
  (reason) => RETRY_AFTER_SECONDS_BY_REASON[reason] === null
);
const USER_MEMORY_ITEM_SCHEMA = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    content: { type: 'string', maxLength: MEMORY_MAX_CHARS },
    createdAt: { type: 'string', format: 'date-time' },
    updatedAt: { type: 'string', format: 'date-time' },
    source: {
      type: 'object',
      nullable: true,
      description:
        'The conversation that last wrote the memory; null once it is deleted',
      properties: {
        conversationId: { type: 'string', format: 'uuid' },
        title: { type: 'string', nullable: true },
      },
    },
    withheld: {
      type: 'boolean',
      description:
        'Fails recall screening: no prompt receives it, but it counts toward the cap until deleted',
    },
  },
} as const;

function toUserMemoryItem(memory: StoredMemory): UserMemoryItem {
  return {
    id: memory.id,
    content: memory.content,
    createdAt: memory.createdAt.toISOString(),
    updatedAt: memory.updatedAt.toISOString(),
    source: memory.source,
    withheld: !isRecallableMemory(memory.content),
  };
}

@ApiTags('Agent')
@ApiBearerAuth()
@ApiUnauthorized()
@UseGuards(JwtAuthGuard)
@UseFilters(AiUnavailableExceptionFilter, MemoryUnavailableExceptionFilter)
@Controller('agent/memories')
export class MemoryController {
  constructor(
    @Inject(MEMORY_REPOSITORY) private readonly memory: MemoryRepository,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly tierResolver: TierResolver,
    private readonly editMemory: EditMemoryHandler
  ) {}

  @ApiOkResponse({
    description:
      "The caller's long-term memories, newest-updated first, at most AI_MEMORY_MAX_PER_USER",
    schema: { type: 'array', items: USER_MEMORY_ITEM_SCHEMA },
  })
  @Get()
  async list(@CurrentUser() user: RequestUser): Promise<UserMemoryItem[]> {
    const stored = await this.memory.listWithSources(
      user.id,
      this.config.get('AI_MEMORY_MAX_PER_USER')
    );
    return stored.map(toUserMemoryItem);
  }

  @ApiBadRequest(
    `an id that is not a UUID, blank text, or text longer than ${MEMORY_MAX_CHARS} characters`
  )
  @ApiNotFound('the caller has no such memory')
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    description: `${AGENT_MEMORY_REJECTED_CODE}: the text was refused; details.reason is ${MEMORY_EDIT_REJECTION_REASONS.join(' or ')}`,
  })
  @ApiResponse({
    status: HttpStatus.TOO_MANY_REQUESTS,
    description: `${AIErrorCodes.RATE_LIMIT_EXCEEDED}: the caller is over their AI rate limit`,
  })
  @ApiServiceUnavailable(
    `${AGENT_MEMORY_UNAVAILABLE_CODE}: details.reason is ${RETRYABLE_REASONS.join(' or ')} (retry after ${SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS}s) or ${FINAL_REASONS.join(' or ')} (no retry helps); a tier that could not be resolved also answers 503, retry after ${SERVICE_UNAVAILABLE_RETRY_AFTER_SECONDS}s`
  )
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async edit(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: EditMemoryDto,
    @Req() req: Request
  ): Promise<void> {
    const outcome = await this.editMemory.execute({
      userId: user.id,
      memoryId: id,
      content: body.content,
      tierOf: () =>
        this.tierResolver.resolve({
          userId: user.id,
          isAnonymous: user.isAnonymous === true,
          clientIp: clientIpOf(req),
        }),
    });
    switch (outcome.kind) {
      case EDIT_MEMORY_OUTCOME.EDITED:
        return;
      case EDIT_MEMORY_OUTCOME.NOT_FOUND:
        throw new NotFoundException(MEMORY_NOT_FOUND_MESSAGE);
      case EDIT_MEMORY_OUTCOME.REJECTED:
        throw new UnprocessableEntityException({
          code: AGENT_MEMORY_REJECTED_CODE,
          message: 'The memory text was refused',
          details: { reason: outcome.reason },
        });
      case EDIT_MEMORY_OUTCOME.RATE_LIMITED: {
        const { code, message } = AIErrors.rateLimitExceeded(
          outcome.reason ?? undefined
        );
        throw new HttpException(
          { code, message },
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
      case EDIT_MEMORY_OUTCOME.UNAVAILABLE:
        throw new MemoryUnavailableException(
          outcome.reason,
          RETRY_AFTER_SECONDS_BY_REASON[outcome.reason]
        );
      default: {
        const unhandled: never = outcome;
        throw new Error(`Unhandled memory edit outcome: ${String(unhandled)}`);
      }
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOne(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    const ok = await this.memory.deleteForUser(user.id, id);
    if (!ok) {
      throw new NotFoundException(MEMORY_NOT_FOUND_MESSAGE);
    }
  }

  @Delete()
  async deleteAll(
    @CurrentUser() user: RequestUser
  ): Promise<{ deleted: number }> {
    return { deleted: await this.memory.deleteAllForUser(user.id) };
  }
}
