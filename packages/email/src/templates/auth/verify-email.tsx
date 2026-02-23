import { DEFAULT_LOCALE, type Locale } from '../../i18n/config';
import { AUTH_TRANSLATION_KEY, AuthEmailTemplate } from './auth-email-template';

interface VerifyEmailProps {
  name: string;
  verificationUrl: string;
  locale: Locale;
}

export const VerifyEmailEmail = ({
  name = 'John Doe',
  verificationUrl = 'https://knowtis.com/verify-email?token=preview-token',
  locale = DEFAULT_LOCALE,
}: VerifyEmailProps) => (
  <AuthEmailTemplate
    name={name}
    actionUrl={verificationUrl}
    locale={locale}
    translationKey={AUTH_TRANSLATION_KEY.VERIFY_EMAIL}
  />
);

export default VerifyEmailEmail;
