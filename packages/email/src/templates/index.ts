import type { Locale } from '../i18n/config';
import { ResetPasswordEmail } from './auth/reset-password';
import { VerifyEmailEmail } from './auth/verify-email';

export interface TemplatePropsMap {
  'verify-email': {
    name: string;
    verificationUrl: string;
    code: string;
    locale: Locale;
  };
  'reset-password': { name: string; resetUrl: string; locale: Locale };
}

export type TemplateName = keyof TemplatePropsMap;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const templates: Record<TemplateName, React.FC<any>> = {
  'verify-email': VerifyEmailEmail,
  'reset-password': ResetPasswordEmail,
};
