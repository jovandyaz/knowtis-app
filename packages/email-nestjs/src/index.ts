// Module
export { EmailModule } from './email.module';
export type { EmailModuleOptions } from './email.module-definition';

// Services
export { AuthEmailService } from './services/auth-email.service';

// Ports
export type { EmailSender, SendEmailOptions } from './ports/email-sender.port';
export { EmailSendError } from './ports/email-sender.port';

// Adapters
export { ResendSender } from './adapters/resend.sender';
export { ConsoleSender } from './adapters/console.sender';

// Constants
export {
  EMAIL_SENDER,
  EMAIL_MODULE_OPTIONS,
  EMAIL_SUBJECT_VERIFY,
  EMAIL_SUBJECT_RESET_PASSWORD,
  AUTH_PATH_VERIFY_EMAIL,
  AUTH_PATH_RESET_PASSWORD,
  EMAIL_ERROR_SEND_FAILED,
  DEFAULT_FRONTEND_URL,
  DEFAULT_FROM_ADDRESS,
} from './constants';
