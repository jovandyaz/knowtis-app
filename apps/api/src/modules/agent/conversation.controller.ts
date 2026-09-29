import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  Req,
  UseFilters,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

import type {
  ConversationPage,
  ConversationTranscript,
} from '@knowtis/shared-types';

import type { EnvConfig } from '../../config/env.config';
import { reasonOf } from '../../core/errors/reason-of';
import { clientIpOf } from '../../core/http/client-ip';
import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
} from '../../core/pagination/pagination.constants';
import { AiUnavailableExceptionFilter } from '../ai/ai-unavailable.filter';
import { MessageQuotaService } from '../ai/application/services/message-quota.service';
import { TierResolver } from '../ai/application/services/tier-resolver.service';
import { CONVERSATION_NOT_FOUND_MESSAGE } from './domain/agent-errors';
import { hasMessagesLeft, isContinuableStop } from './domain/continuable';
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from './domain/ports/conversation.repository';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { RenameConversationDto } from './dto/rename-conversation.dto';

@UseGuards(JwtAuthGuard)
@UseFilters(AiUnavailableExceptionFilter)
@Controller('agent/conversations')
export class ConversationController {
  private readonly logger = new Logger(ConversationController.name);

  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    private readonly config: ConfigService<EnvConfig, true>,
    private readonly tierResolver: TierResolver,
    private readonly quota: MessageQuotaService
  ) {}

  @Get()
  async list(
    @CurrentUser() user: RequestUser,
    @Query() query: ListConversationsQueryDto
  ): Promise<ConversationPage> {
    const page = query.page ?? DEFAULT_PAGE;
    const limit = query.limit ?? DEFAULT_LIMIT;
    const { items, total } = await this.conversations.listForUser(user.id, {
      offset: (page - 1) * limit,
      limit,
    });
    return { items, total, page, limit };
  }

  @Get(':id/messages')
  async transcript(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Req() req: Request
  ): Promise<ConversationTranscript> {
    const transcript = await this.conversations.loadTranscriptForUser(
      id,
      user.id,
      this.config.get('AI_AGENT_HISTORY_LIMIT')
    );
    if (!transcript) {
      throw new NotFoundException(CONVERSATION_NOT_FOUND_MESSAGE);
    }
    const last = transcript.messages.at(-1);
    if (
      last?.role !== 'assistant' ||
      last.turnId === null ||
      !isContinuableStop(last.stopReason)
    ) {
      return { ...transcript, continuableTurnId: null };
    }
    try {
      const execution = await this.tierResolver.resolve({
        userId: user.id,
        isAnonymous: user.isAnonymous === true,
        clientIp: clientIpOf(req),
      });
      const quota = await this.quota.snapshot(execution);
      return {
        ...transcript,
        continuableTurnId: hasMessagesLeft(quota) ? last.turnId : null,
      };
    } catch (error) {
      this.logger.warn({
        event: 'agent.continuable.snapshot_failed',
        conversationId: id,
        error: reasonOf(error),
      });
      return { ...transcript, continuableTurnId: null };
    }
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async rename(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: RenameConversationDto
  ): Promise<void> {
    const renamed = await this.conversations.rename(id, user.id, body.title);
    if (!renamed) {
      throw new NotFoundException(CONVERSATION_NOT_FOUND_MESSAGE);
    }
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    const deleted = await this.conversations.deleteForUser(id, user.id);
    if (!deleted) {
      throw new NotFoundException(CONVERSATION_NOT_FOUND_MESSAGE);
    }
  }
}
