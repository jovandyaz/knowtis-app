import { EmailService } from '@jovandyaz/auth-nestjs';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import {
  DEFAULT_LOCALE,
  renderEmail,
  type TemplateName,
  type TemplatePropsMap,
} from '@jovandyaz/email';
import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import {
  AUTH_PATH_RESET_PASSWORD,
  AUTH_PATH_VERIFY_EMAIL,
  EMAIL_ERROR_SEND_FAILED,
  EMAIL_SUBJECT_RESET_PASSWORD,
  EMAIL_SUBJECT_VERIFY,
} from '../constants';
import type { EmailSender } from '../ports/email-sender.port';

@Injectable()
export class AuthEmailService implements EmailService {
  private readonly logger = new Logger(AuthEmailService.name);

  constructor(
    private readonly sender: EmailSender,
    private readonly defaults: { readonly from: string },
    private readonly frontendUrl: string
  ) {}

  async sendEmailVerification(
    email: string,
    token: string,
    name: string
  ): Promise<Result<void, AuthDomainError>> {
    return this.sendAuthEmail('verify-email', email, EMAIL_SUBJECT_VERIFY, {
      name,
      verificationUrl: `${this.frontendUrl}${AUTH_PATH_VERIFY_EMAIL}?token=${token}`,
      locale: DEFAULT_LOCALE,
    });
  }

  async sendPasswordReset(
    email: string,
    token: string,
    name: string
  ): Promise<Result<void, AuthDomainError>> {
    return this.sendAuthEmail(
      'reset-password',
      email,
      EMAIL_SUBJECT_RESET_PASSWORD,
      {
        name,
        resetUrl: `${this.frontendUrl}${AUTH_PATH_RESET_PASSWORD}?token=${token}`,
        locale: DEFAULT_LOCALE,
      }
    );
  }

  private async sendAuthEmail<T extends TemplateName>(
    template: T,
    email: string,
    subject: string,
    props: TemplatePropsMap[T]
  ): Promise<Result<void, AuthDomainError>> {
    let html: string;
    try {
      html = await renderEmail(template, props);
    } catch (cause) {
      this.logger.error(`Failed to render ${template}: ${cause}`);
      return err({
        code: EMAIL_ERROR_SEND_FAILED,
        message: `Template rendering failed: ${template}`,
      });
    }

    const result = await this.sender.send({
      to: email,
      subject,
      html,
      from: this.defaults.from,
    });

    if (result.isErr()) {
      this.logger.error(
        `Failed to send ${template} to ${email}: ${result.error.message}`
      );
      return err({
        code: EMAIL_ERROR_SEND_FAILED,
        message: result.error.message,
      });
    }

    return ok(undefined);
  }
}
