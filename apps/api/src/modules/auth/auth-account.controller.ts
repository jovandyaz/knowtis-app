import {
  CurrentUser,
  ForgotPasswordHandler,
  JwtAuthGuard,
  Public,
  ResendVerificationHandler,
  ResetPasswordHandler,
  unwrapOrThrow,
  VerifyEmailCodeHandler,
  VerifyEmailHandler,
} from '@jovandyaz/auth-nestjs';
import type { RequestUser } from '@jovandyaz/auth/server';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
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

import { UserScopedThrottlerGuard } from '../ai/guards/user-scoped-throttler.guard';
import {
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyEmailCodeDto,
  VerifyEmailDto,
} from './dto/auth.dto';

@ApiTags('Authentication')
@Controller('auth')
@UseGuards(JwtAuthGuard)
export class AuthAccountController {
  constructor(
    private readonly forgotPasswordHandler: ForgotPasswordHandler,
    private readonly resetPasswordHandler: ResetPasswordHandler,
    private readonly verifyEmailHandler: VerifyEmailHandler,
    private readonly verifyEmailCodeHandler: VerifyEmailCodeHandler,
    private readonly resendVerificationHandler: ResendVerificationHandler
  ) {}

  @ApiOperation({ summary: 'Request a password reset email' })
  @ApiResponse({
    status: 200,
    description: 'If the email exists, a reset link will be sent',
  })
  @Public()
  @Throttle({ default: { limit: 3, ttl: 900000 } })
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
  @Throttle({ default: { limit: 5, ttl: 900000 } })
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
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    const result = await this.verifyEmailHandler.execute({
      token: dto.token,
    });
    unwrapOrThrow(result);
    return { message: 'Email verified successfully' };
  }

  @ApiOperation({ summary: 'Verify email with a 6-digit code' })
  @ApiResponse({ status: 200, description: 'Email verified successfully' })
  @ApiResponse({
    status: 400,
    description: 'Invalid or expired verification code',
  })
  @ApiResponse({ status: 429, description: 'Too many verification attempts' })
  @ApiBearerAuth()
  @UseGuards(UserScopedThrottlerGuard)
  @Throttle({ default: { limit: 10, ttl: 900000 } })
  @Post('verify-email/code')
  @HttpCode(HttpStatus.OK)
  async verifyEmailCode(
    @CurrentUser() user: RequestUser,
    @Body() dto: VerifyEmailCodeDto
  ) {
    const result = await this.verifyEmailCodeHandler.execute({
      userId: user.id,
      code: dto.code,
      familyId: user.familyId,
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
  @UseGuards(UserScopedThrottlerGuard)
  @Throttle({ default: { limit: 3, ttl: 900000 } })
  @Post('resend-verification')
  @HttpCode(HttpStatus.OK)
  async resendVerification(@CurrentUser() user: RequestUser) {
    // A visitor's address is a synthetic anonymous.knowtis.local one; mailing it
    // bounces, and bounces cost the sending domain's reputation.
    if (user.isAnonymous === true) {
      throw new ForbiddenException(
        'Email verification requires a registered account'
      );
    }

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
}
