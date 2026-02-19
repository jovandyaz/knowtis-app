import {
  CurrentUser,
  ForgotPasswordHandler,
  JwtAuthGuard,
  LocalAuthGuard,
  LoginUserHandler,
  LogoutUserHandler,
  Public,
  RefreshTokensHandler,
  RegisterUserHandler,
  ResendVerificationHandler,
  ResetPasswordHandler,
  unwrapOrThrow,
  VerifyEmailHandler,
} from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Ip,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import type {
  ForgotPasswordDto,
  RefreshTokenDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

@ApiTags('Authentication')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthController {
  constructor(
    private readonly registerHandler: RegisterUserHandler,
    private readonly loginHandler: LoginUserHandler,
    private readonly refreshHandler: RefreshTokensHandler,
    private readonly logoutHandler: LogoutUserHandler,
    private readonly forgotPasswordHandler: ForgotPasswordHandler,
    private readonly resetPasswordHandler: ResetPasswordHandler,
    private readonly verifyEmailHandler: VerifyEmailHandler,
    private readonly resendVerificationHandler: ResendVerificationHandler
  ) {}

  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful, returns tokens' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @Public()
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 per 15 min
  @UseGuards(LocalAuthGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @CurrentUser() user: RequestUser,
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
    return unwrapOrThrow(result);
  }

  @ApiOperation({ summary: 'Register a new user account' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  @Public()
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 3 per 15 min
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Headers('user-agent') userAgent?: string,
    @Ip() ipAddress?: string
  ) {
    const result = await this.registerHandler.execute(dto, {
      userAgent,
      ipAddress,
    });
    return unwrapOrThrow(result);
  }

  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'New tokens generated' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 per min
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshTokenDto) {
    const result = await this.refreshHandler.execute(dto.refreshToken);
    return unwrapOrThrow(result);
  }

  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({
    status: 200,
    description: 'If the email exists, a reset link will be sent',
  })
  @Public()
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 3 per 15 min
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    const result = await this.forgotPasswordHandler.execute({
      email: dto.email,
    });
    unwrapOrThrow(result);
    return { message: 'If the email exists, a reset link will be sent' };
  }

  @ApiOperation({ summary: 'Reset password with a valid token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired reset token',
  })
  @Public()
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 per 15 min
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    const result = await this.resetPasswordHandler.execute({
      token: dto.token,
      newPassword: dto.newPassword,
    });
    unwrapOrThrow(result);
    return { message: 'Password has been reset successfully' };
  }

  @ApiOperation({ summary: 'Verify email with a valid token' })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired verification token',
  })
  @Public()
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 per 15 min
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const result = await this.verifyEmailHandler.execute({
      token: dto.token,
    });
    unwrapOrThrow(result);
    return { message: 'Email verified successfully' };
  }

  @ApiOperation({ summary: 'Resend email verification' })
  @ApiResponse({
    status: 200,
    description: 'Verification email sent successfully',
  })
  @ApiResponse({ status: 409, description: 'Email already verified' })
  @ApiBearerAuth()
  @Throttle({ default: { limit: 3, ttl: 900000 } }) // 3 per 15 min
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@CurrentUser() user: RequestUser) {
    const result = await this.resendVerificationHandler.execute({
      userId: user.id,
    });
    unwrapOrThrow(result);
    return { message: 'Verification email sent successfully' };
  }

  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'Returns current user data' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiBearerAuth()
  @Get('me')
  getProfile(@CurrentUser() user: RequestUser) {
    return { user };
  }

  @ApiOperation({ summary: 'Logout user and invalidate session' })
  @ApiResponse({ status: 204, description: 'Logout successful' })
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() body: RefreshTokenDto) {
    const result = await this.logoutHandler.execute(body.refreshToken);
    unwrapOrThrow(result);
  }
}
