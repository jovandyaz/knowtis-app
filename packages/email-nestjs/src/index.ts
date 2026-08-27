export { EmailModule } from './email.module';
export type { EmailModuleOptions } from './email.module-definition';

export { AuthEmailService } from './services/auth-email.service';

export type { EmailSender, SendEmailOptions } from './ports/email-sender.port';
export { EmailSendError } from './ports/email-sender.port';

export { ResendSender } from './adapters/resend.sender';
export { ConsoleSender } from './adapters/console.sender';

export {
  EMAIL_SENDER,
  EMAIL_MODULE_OPTIONS,
  AUTH_PATH_VERIFY_EMAIL,
  AUTH_PATH_RESET_PASSWORD,
  EMAIL_ERROR_SEND_FAILED,
  DEFAULT_FRONTEND_URL,
  DEFAULT_FROM_ADDRESS,
} from './constants';
