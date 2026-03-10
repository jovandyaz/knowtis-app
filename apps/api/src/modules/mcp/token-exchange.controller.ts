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
import { eq } from 'drizzle-orm';

import { DATABASE_CONNECTION, users, type Database } from '../../database';
import { TokenExchangeDto } from './dto/token-exchange.dto';
import { McpKeysService } from './mcp-keys.service';

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

  @Post()
  @HttpCode(HttpStatus.OK)
  async exchange(@Body() dto: TokenExchangeDto) {
    const prefix = dto.apiKey.slice(0, 24);
    const keyRecord = await this.mcpKeysService.findByPrefix(prefix);

    if (!keyRecord) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (!McpKeysService.verifyKey(dto.apiKey, keyRecord.keyHash)) {
      throw new UnauthorizedException('Invalid API key');
    }

    if (keyRecord.expiresAt && keyRecord.expiresAt < new Date()) {
      throw new UnauthorizedException('API key expired');
    }

    const [user] = await this.db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, keyRecord.userId))
      .limit(1);

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    const accessToken = await this.jwtService.signAsync(
      {
        sub: user.id,
        email: user.email,
        source: 'mcp',
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
}
