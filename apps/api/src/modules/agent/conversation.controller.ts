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
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type {
  ConversationPage,
  ConversationTranscript,
} from '@knowtis/shared-types';

import type { EnvConfig } from '../../config/env.config';
import {
  DEFAULT_LIMIT,
  DEFAULT_PAGE,
} from '../../core/pagination/pagination.constants';
import {
  CONVERSATION_REPOSITORY,
  type ConversationRepository,
} from './domain/ports/conversation.repository';
import { ListConversationsQueryDto } from './dto/list-conversations-query.dto';
import { RenameConversationDto } from './dto/rename-conversation.dto';

const CONVERSATION_NOT_FOUND = 'Conversation not found';

@UseGuards(JwtAuthGuard)
@Controller('agent/conversations')
export class ConversationController {
  constructor(
    @Inject(CONVERSATION_REPOSITORY)
    private readonly conversations: ConversationRepository,
    private readonly config: ConfigService<EnvConfig, true>
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
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<ConversationTranscript> {
    const transcript = await this.conversations.loadTranscriptForUser(
      id,
      user.id,
      this.config.get('AI_AGENT_HISTORY_LIMIT')
    );
    if (!transcript) {
      throw new NotFoundException(CONVERSATION_NOT_FOUND);
    }
    return transcript;
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
      throw new NotFoundException(CONVERSATION_NOT_FOUND);
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
      throw new NotFoundException(CONVERSATION_NOT_FOUND);
    }
  }
}
