import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { eq } from 'drizzle-orm';

import { DATABASE_CONNECTION, users, type Database } from '../../database';
import { TokenExchangeDto } from './dto/token-exchange.dto';
import { McpKeysService } from './mcp-keys.service';
import { TOKEN_SOURCE_MCP } from './mcp-token';

const tokenExchangeResultSchema = {
  type: 'object' as const,
  properties: {
    accessToken: { type: 'string', description: 'Short-lived JWT token' },
    expiresIn: {
      type: 'number',
      description: 'Token TTL in seconds',
      example: 900,
    },
    scopes: { type: 'string', example: 'read,write' },
  },
};

@ApiTags('MCP Token Exchange')
@Controller('auth/token-exchange')
export class TokenExchangeController {
  private readonly logger = new Logger(TokenExchangeController.name);

  constructor(
    private readonly mcpKeysService: McpKeysService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    @Inject(DATABASE_CONNECTION)
    private readonly db: Database
  ) {}

  @ApiOperation({
    summary: 'Exchange an MCP API key for a JWT token',
    description:
      'Validates the provided MCP API key and returns a short-lived JWT access token (15 minutes) that can be used to authenticate subsequent API requests.',
  })
  @ApiBody({ type: TokenExchangeDto })
  @ApiResponse({
    status: 200,
    description: 'Token exchanged successfully',
    schema: tokenExchangeResultSchema,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — invalid, expired, or revoked API key',
  })
  @Post()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @HttpCode(HttpStatus.OK)
  async exchange(@Body() dto: TokenExchangeDto) {
    const prefix = dto.apiKey.slice(0, 24);
    const keyRecord = await this.mcpKeysService.findByPrefix(prefix);

    if (!keyRecord) {
      throw this.deny('key_not_found', prefix);
    }

    if (!McpKeysService.verifyKey(dto.apiKey, keyRecord.keyHash)) {
      throw this.deny('key_hash_mismatch', prefix);
    }

    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      throw this.deny('key_expired', prefix);
    }

    const [user] = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, keyRecord.userId))
      .limit(1);

    if (!user) {
      throw this.deny('user_not_found', prefix);
    }

    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        source: TOKEN_SOURCE_MCP,
        scopes: keyRecord.scopes,
      },
      {
        secret: this.configService.getOrThrow('JWT_SECRET'),
        expiresIn: '15m',
      }
    );

    // Update last used timestamp (fire and forget)
    this.mcpKeysService.updateLastUsed(keyRecord.id).catch((err) => {
      this.logger.error(
        `Failed to update last used timestamp for key ${keyRecord.id}:`,
        err
      );
    });

    return {
      accessToken,
      expiresIn: 900,
      scopes: keyRecord.scopes,
    };
  }

  private deny(reason: string, prefix: string): UnauthorizedException {
    this.logger.warn({
      event: 'mcp.token_exchange.denied',
      reason,
      prefix,
    });
    return new UnauthorizedException('Invalid API key');
  }
}
