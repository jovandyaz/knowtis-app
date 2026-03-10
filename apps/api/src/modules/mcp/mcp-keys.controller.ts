import { CurrentUser, JwtAuthGuard } from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';

import { CreateMcpKeyDto } from './dto/mcp-keys.dto';
import { McpKeysService } from './mcp-keys.service';

@Controller('mcp/keys')
@UseGuards(JwtAuthGuard)
export class McpKeysController {
  constructor(private readonly mcpKeysService: McpKeysService) {}

  @Post()
  async create(@CurrentUser() user: RequestUser, @Body() dto: CreateMcpKeyDto) {
    const { key, record } = await this.mcpKeysService.create(
      user.id,
      dto.name,
      dto.scopes
    );

    return {
      id: record.id,
      name: record.name,
      key,
      keyPrefix: record.keyPrefix,
      scopes: record.scopes,
      createdAt: record.createdAt,
    };
  }

  @Get()
  async list(@CurrentUser() user: RequestUser) {
    return this.mcpKeysService.list(user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revoke(
    @CurrentUser() user: RequestUser,
    @Param('id', ParseUUIDPipe) id: string
  ) {
    const result = await this.mcpKeysService.revoke(user.id, id);

    if (!result) {
      throw new NotFoundException('API key not found or already revoked');
    }
  }
}
