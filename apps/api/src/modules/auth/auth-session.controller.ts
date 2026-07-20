import {
  CurrentUser,
  JwtAuthGuard,
  LocalAuthGuard,
  LoginUserHandler,
  LogoutUserHandler,
  Public,
  RefreshTokensHandler,
  RegisterUserHandler,
  unwrapOrThrow,
} from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { AnonymousAuthService } from './application/services/anonymous-auth.service';
import { AnonymousSessionDto, LoginDto, RegisterDto } from './dto/auth.dto';
import type { RefreshTokenDto } from './dto/auth.dto';
import { DrizzleAnonymousDataMigrationRepository } from './infrastructure/persistence/drizzle-anonymous-data-migration.repository';
import {
  clearLegacyHostOnlyCookie,
  clearRefreshTokenCookie,
  deriveCookieDomain,
  resolveRefreshCookieName,
  setRefreshTokenCookie,
  type CookieConfig,
} from './utils/cookie.utils';

@ApiTags('Authentication')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthSessionController {
  private readonly logger = new Logger(AuthSessionController.name);
  private readonly secure: boolean;
  private readonly cookieDomain: string | undefined;
  private readonly backofficeUrl: string | undefined;

  constructor(
    private readonly registerHandler: RegisterUserHandler,
    private readonly loginHandler: LoginUserHandler,
    private readonly refreshHandler: RefreshTokensHandler,
    private readonly logoutHandler: LogoutUserHandler,
    private readonly anonymousAuthService: AnonymousAuthService,
    private readonly anonymousDataMigration: DrizzleAnonymousDataMigrationRepository,
    configService: ConfigService
  ) {
    const isProduction = configService.get('NODE_ENV') === 'production';
    const frontendUrl = configService.get<string>('FRONTEND_URL') ?? '';

    this.secure = isProduction;
    this.cookieDomain = isProduction
      ? deriveCookieDomain(frontendUrl)
      : undefined;
    this.backofficeUrl = configService.get<string>('BACKOFFICE_URL');
  }

  private cookieConfigFor(origin: string | undefined): CookieConfig {
    return {
      secure: this.secure,
      domain: this.cookieDomain,
      name: resolveRefreshCookieName(origin, this.backofficeUrl),
    };
  }

  @ApiOperation({ summary: 'Create an anonymous session' })
  @ApiResponse({ status: 201, description: 'Anonymous session created' })
  @Public()
  @Throttle({ default: { limit: 3, ttl: 60000 } })
  @Post('anonymous')
  @HttpCode(HttpStatus.CREATED)
  async createAnonymousSession(
    @Body() dto: AnonymousSessionDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('origin') origin?: string
  ) {
    const session = await this.anonymousAuthService.createAnonymousSession(
      dto.anonymousToken
    );

    const cookieConfig = this.cookieConfigFor(origin);
    clearLegacyHostOnlyCookie(res, cookieConfig);
    setRefreshTokenCookie(res, session.refreshToken, cookieConfig);

    return { user: session.user, accessToken: session.accessToken };
  }

  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful, returns tokens' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @Public()
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @CurrentUser() user: RequestUser,
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
    @Headers('origin') origin?: string
  ) {
    const result = await this.loginHandler.login(
      {
        id: user.id,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl ?? null,
      },
      { userAgent, ipAddress }
    );

    const data = unwrapOrThrow(result);

    const { anonymousUserId, anonymousToken } = dto;

    if (anonymousUserId && anonymousToken) {
      try {
        await this.verifyAndMigrateAnonymousData(
          anonymousUserId,
          anonymousToken,
          data.user.id as string
        );
      } catch (error) {
        this.logger.warn('Anonymous data migration failed during login', error);
      }
    }

    return this.respondWithTokens(res, data, origin);
  }

  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @Public()
  @Throttle({ default: { limit: 3, ttl: 900000 } })
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string,
    @Headers('origin') origin?: string
  ) {
    const result = await this.registerHandler.execute(dto, {
      userAgent,
      ipAddress,
    });
    const data = unwrapOrThrow(result);

    if (dto.anonymousUserId && dto.anonymousToken) {
      try {
        await this.verifyAndMigrateAnonymousData(
          dto.anonymousUserId,
          dto.anonymousToken,
          data.user.id
        );
      } catch (error) {
        this.logger.warn(
          'Anonymous data migration failed during registration',
          error
        );
      }
    }

    return this.respondWithTokens(res, data, origin);
  }

  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'New tokens generated' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Body() dto: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('origin') origin?: string
  ) {
    const cookieConfig = this.cookieConfigFor(origin);
    const refreshToken = this.extractRefreshToken(req, dto, cookieConfig.name);

    if (!refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    // Drop any stale host-only cookie up front so a reuse error (which throws
    // below) still heals a browser that is sending a duplicate refresh cookie.
    clearLegacyHostOnlyCookie(res, cookieConfig);

    const result = await this.refreshHandler.execute(refreshToken);
    const data = unwrapOrThrow(result);

    setRefreshTokenCookie(res, data.refreshToken, cookieConfig);

    return { accessToken: data.accessToken };
  }

  @ApiOperation({ summary: 'Logout user and invalidate session' })
  @ApiResponse({ status: 204, description: 'Logout successful' })
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: Request,
    @Body() body: RefreshTokenDto,
    @Res({ passthrough: true }) res: Response,
    @Headers('origin') origin?: string
  ) {
    const cookieConfig = this.cookieConfigFor(origin);
    const refreshToken = this.extractRefreshToken(req, body, cookieConfig.name);

    if (refreshToken) {
      const result = await this.logoutHandler.execute(refreshToken);
      unwrapOrThrow(result);
    }

    clearLegacyHostOnlyCookie(res, cookieConfig);
    clearRefreshTokenCookie(res, cookieConfig);
  }

  private extractRefreshToken(
    req: Request,
    dto: RefreshTokenDto,
    cookieName: string
  ): string | undefined {
    return req.cookies?.[cookieName] ?? dto.refreshToken;
  }

  private async verifyAndMigrateAnonymousData(
    anonymousUserId: string,
    anonymousToken: string,
    registeredUserId: string
  ): Promise<void> {
    const verified = await this.anonymousAuthService.verifyMigrationProof(
      anonymousToken,
      anonymousUserId
    );

    if (!verified) {
      throw new ForbiddenException(
        'Invalid anonymous token: cannot verify ownership of anonymous session'
      );
    }

    await this.anonymousDataMigration.migrateAnonymousData(
      anonymousUserId,
      registeredUserId
    );
  }

  private respondWithTokens(
    res: Response,
    data: {
      user: unknown;
      tokens: { accessToken: string; refreshToken: string };
    },
    origin: string | undefined
  ) {
    const cookieConfig = this.cookieConfigFor(origin);
    clearLegacyHostOnlyCookie(res, cookieConfig);
    setRefreshTokenCookie(res, data.tokens.refreshToken, cookieConfig);
    return {
      user: data.user,
      tokens: { accessToken: data.tokens.accessToken },
    };
  }
}
