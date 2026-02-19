import type { EmailService } from '@jovandyaz/auth-nestjs';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ok, type Result } from 'neverthrow';

@Injectable()
export class ConsoleEmailService implements EmailService {
  private readonly logger = new Logger(ConsoleEmailService.name);
  private readonly frontendUrl: string;

  constructor(configService: ConfigService) {
    const nodeEnv = configService.get<string>('NODE_ENV', 'development');
    if (nodeEnv === 'production') {
      this.logger.warn(
        'ConsoleEmailService is active in production. Emails will only be logged, not sent. ' +
          'Configure a real email service (e.g. Resend) for production use.'
      );
    }

    this.frontendUrl = configService.get<string>(
      'FRONTEND_URL',
      'http://localhost:4200'
    );
  }

  async sendPasswordReset(
    email: string,
    token: string,
    name: string
  ): Promise<Result<void, AuthDomainError>> {
    this.logger.log(`[PASSWORD RESET] To: ${email}, Name: ${name}`);
    this.logger.log(
      `[PASSWORD RESET] Reset link: ${this.frontendUrl}/reset-password?token=${token}`
    );

    return ok(undefined);
  }

  async sendEmailVerification(
    email: string,
    token: string,
    name: string
  ): Promise<Result<void, AuthDomainError>> {
    this.logger.log(`[EMAIL VERIFICATION] To: ${email}, Name: ${name}`);
    this.logger.log(
      `[EMAIL VERIFICATION] Verify link: ${this.frontendUrl}/verify-email?token=${token}`
    );

    return ok(undefined);
  }
}
