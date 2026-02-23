import type { Result } from 'neverthrow';

export interface SendEmailOptions {
  readonly to: string;
  readonly subject: string;
  readonly html: string;
  readonly from?: string;
}

export class EmailSendError extends Error {
  constructor(
    message: string,
    public override readonly cause?: unknown
  ) {
    super(message);
    this.name = 'EmailSendError';
  }
}

export interface EmailSender {
  send(options: SendEmailOptions): Promise<Result<void, EmailSendError>>;
}
