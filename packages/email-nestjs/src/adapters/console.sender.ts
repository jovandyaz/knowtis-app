import { Logger } from '@nestjs/common';
import { ok, type Result } from 'neverthrow';

import type {
  EmailSender,
  EmailSendError,
  SendEmailOptions,
} from '../ports/email-sender.port';

export class ConsoleSender implements EmailSender {
  private readonly logger = new Logger(ConsoleSender.name);

  async send(options: SendEmailOptions): Promise<Result<void, EmailSendError>> {
    this.logger.log(`[EMAIL] To: ${options.to}`);
    this.logger.log(`[EMAIL] Subject: ${options.subject}`);
    this.logger.log(`[EMAIL] From: ${options.from ?? 'default'}`);
    this.logger.debug(`[EMAIL] HTML length: ${options.html.length} chars`);
    return ok(undefined);
  }
}
