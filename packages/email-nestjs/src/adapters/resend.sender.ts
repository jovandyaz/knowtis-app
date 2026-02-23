import { Logger } from '@nestjs/common';
import { err, ok, type Result } from 'neverthrow';
import { Resend } from 'resend';

import { DEFAULT_FROM_ADDRESS } from '../constants';
import {
  EmailSendError,
  type EmailSender,
  type SendEmailOptions,
} from '../ports/email-sender.port';

export class ResendSender implements EmailSender {
  private readonly logger = new Logger(ResendSender.name);
  private readonly resend: Resend;

  constructor(apiKey: string) {
    this.resend = new Resend(apiKey);
  }

  async send(options: SendEmailOptions): Promise<Result<void, EmailSendError>> {
    try {
      const { error } = await this.resend.emails.send({
        from: options.from ?? DEFAULT_FROM_ADDRESS,
        to: options.to,
        subject: options.subject,
        html: options.html,
      });

      if (error) {
        this.logger.error(`Resend API error: ${error.message}`);
        return err(new EmailSendError(error.message));
      }

      return ok(undefined);
    } catch (cause) {
      this.logger.error('Failed to send email via Resend', cause);
      return err(new EmailSendError('Failed to send email', cause));
    }
  }
}
