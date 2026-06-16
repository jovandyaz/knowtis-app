import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../config/env.config';
import {
  MEMORY_REPOSITORY,
  type MemoryRepository,
  type UserMemoryRow,
} from './domain/ports/memory.repository';

@UseGuards(JwtAuthGuard)
@Controller('agent/memories')
export class MemoryController {
  constructor(
    @Inject(MEMORY_REPOSITORY) private readonly memory: MemoryRepository,
    private readonly config: ConfigService<EnvConfig, true>
  ) {}

  @Get()
  list(@CurrentUser() user: RequestUser): Promise<UserMemoryRow[]> {
    return this.memory.listForUser(
      user.id,
      this.config.get('AI_MEMORY_MAX_PER_USER')
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteOne(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string
  ): Promise<void> {
    const ok = await this.memory.deleteForUser(user.id, id);
    if (!ok) {
      throw new NotFoundException('Memory not found');
    }
  }

  @Delete()
  async deleteAll(
    @CurrentUser() user: RequestUser
  ): Promise<{ deleted: number }> {
    return { deleted: await this.memory.deleteAllForUser(user.id) };
  }
}
