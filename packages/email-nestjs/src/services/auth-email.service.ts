import { EmailService } from '@jovandyaz/auth-nestjs';
import type { AuthDomainError } from '@jovandyaz/auth/server';
import {
  DEFAULT_LOCALE,
  emailSubject,
  renderEmail,
  SUPPORTED_LOCALES,
  type Locale,
  type TemplateName,
  type TemplatePropsMap,
} from '@jovandyaz/email';
import { Injectable, Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';

import {
  AUTH_PATH_RESET_PASSWORD,
  AUTH_PATH_VERIFY_EMAIL,
  EMAIL_ERROR_SEND_FAILED,
} from '../constants';
import type { EmailSender } from '../ports/email-sender.port';

function resolveLocale(locale?: string): Locale {
  return (
    SUPPORTED_LOCALES.find((supported) => supported === locale) ??
    DEFAULT_LOCALE
  );
}

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
    payload: { token: string; code: string },
    name: string,
    locale?: string
  ): Promise<Result<void, AuthDomainError>> {
    return this.sendAuthEmail('verify-email', email, {
      name,
      verificationUrl: `${this.frontendUrl}${AUTH_PATH_VERIFY_EMAIL}?token=${payload.token}`,
      code: payload.code,
      locale: resolveLocale(locale),
    });
  }

  async sendPasswordReset(
    email: string,
    token: string,
    name: string,
    locale?: string
  ): Promise<Result<void, AuthDomainError>> {
    return this.sendAuthEmail('reset-password', email, {
      name,
      resetUrl: `${this.frontendUrl}${AUTH_PATH_RESET_PASSWORD}?token=${token}`,
      locale: resolveLocale(locale),
    });
  }

  private async sendAuthEmail<T extends TemplateName>(
    template: T,
    email: string,
    props: TemplatePropsMap[T] & { locale: Locale }
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
      subject: emailSubject(template, props.locale),
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
