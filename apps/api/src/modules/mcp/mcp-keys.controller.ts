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
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { ApiNotFound, ApiUnauthorized } from '../../core/swagger';
import { CreateMcpKeyDto } from './dto/mcp-keys.dto';
import { McpKeysService } from './mcp-keys.service';

const mcpKeyBaseProperties = {
  id: { type: 'string', format: 'uuid' },
  name: { type: 'string', example: 'My Claude Key' },
  keyPrefix: { type: 'string', example: 'knowtis_mcp_live_abc123de' },
  scopes: { type: 'string', example: 'notes:read,notes:write' },
  createdAt: { type: 'string', format: 'date-time' },
};

const createdKeySchema = {
  type: 'object' as const,
  properties: {
    ...mcpKeyBaseProperties,
    key: {
      type: 'string',
      description: 'Full API key — shown only once',
      example: 'knowtis_mcp_live_abc123def456...',
    },
  },
};

const keyListItemSchema = {
  type: 'object' as const,
  properties: {
    ...mcpKeyBaseProperties,
    lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
    expiresAt: { type: 'string', format: 'date-time', nullable: true },
  },
};

@ApiTags('MCP API Keys')
@ApiBearerAuth()
@Controller('mcp/keys')
@UseGuards(JwtAuthGuard)
export class McpKeysController {
  constructor(private readonly mcpKeysService: McpKeysService) {}

  @ApiOperation({
    summary: 'Create a new MCP API key',
    description:
      'Generates a new API key for MCP integrations. The full key is only returned once in the response and cannot be retrieved later.',
  })
  @ApiBody({ type: CreateMcpKeyDto })
  @ApiResponse({
    status: 201,
    description: 'API key created successfully',
    schema: createdKeySchema,
  })
  @ApiUnauthorized()
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

  @ApiOperation({
    summary: 'List MCP API keys',
    description:
      'Returns all active API keys for the authenticated user. Full keys are not included — only the prefix is shown.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of API keys',
    schema: { type: 'array', items: keyListItemSchema },
  })
  @ApiUnauthorized()
  @Get()
  async list(@CurrentUser() user: RequestUser) {
    return this.mcpKeysService.list(user.id);
  }

  @ApiOperation({
    summary: 'Revoke an MCP API key',
    description:
      'Permanently revokes an API key. The key can no longer be used for token exchange.',
  })
  @ApiParam({
    name: 'id',
    type: 'string',
    format: 'uuid',
    description: 'The UUID of the API key to revoke',
  })
  @ApiResponse({ status: 204, description: 'API key revoked successfully' })
  @ApiUnauthorized()
  @ApiNotFound('API key does not exist or already revoked')
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
