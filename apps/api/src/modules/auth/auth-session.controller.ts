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
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import type { RefreshTokenDto, RegisterDto } from './dto/auth.dto';
import {
  clearRefreshTokenCookie,
  REFRESH_TOKEN_COOKIE_NAME,
  setRefreshTokenCookie,
} from './utils/cookie.utils';

@ApiTags('Authentication')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthSessionController {
  private readonly isProduction: boolean;

  constructor(
    private readonly registerHandler: RegisterUserHandler,
    private readonly loginHandler: LoginUserHandler,
    private readonly refreshHandler: RefreshTokensHandler,
    private readonly logoutHandler: LogoutUserHandler,
    configService: ConfigService
  ) {
    this.isProduction = configService.get('NODE_ENV') === 'production';
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
    @Res({ passthrough: true }) res: Response,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string
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

    return this.respondWithTokens(res, unwrapOrThrow(result));
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
    @Ip() ipAddress?: string
  ) {
    const result = await this.registerHandler.execute(dto, {
      userAgent,
      ipAddress,
    });

    return this.respondWithTokens(res, unwrapOrThrow(result));
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
    @Res({ passthrough: true }) res: Response
  ) {
    const refreshToken = this.extractRefreshToken(req, dto);

    if (!refreshToken) {
      throw new BadRequestException('Refresh token is required');
    }

    const result = await this.refreshHandler.execute(refreshToken);
    const data = unwrapOrThrow(result);

    setRefreshTokenCookie(res, data.refreshToken, this.isProduction);

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
    @Res({ passthrough: true }) res: Response
  ) {
    const refreshToken = this.extractRefreshToken(req, body);

    if (refreshToken) {
      const result = await this.logoutHandler.execute(refreshToken);
      unwrapOrThrow(result);
    }

    clearRefreshTokenCookie(res);
  }

  private extractRefreshToken(
    req: Request,
    dto: RefreshTokenDto
  ): string | undefined {
    return req.cookies?.[REFRESH_TOKEN_COOKIE_NAME] ?? dto.refreshToken;
  }

  private respondWithTokens(
    res: Response,
    data: {
      user: unknown;
      tokens: { accessToken: string; refreshToken: string };
    }
  ) {
    setRefreshTokenCookie(res, data.tokens.refreshToken, this.isProduction);
    return {
      user: data.user,
      tokens: { accessToken: data.tokens.accessToken },
    };
  }
}
