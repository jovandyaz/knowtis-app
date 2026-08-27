import { DEFAULT_LOCALE, type Locale } from '../../i18n/config';
import { AUTH_TRANSLATION_KEY, AuthEmailTemplate } from './auth-email-template';

interface VerifyEmailProps {
  name: string;
  verificationUrl: string;
  code: string;
  locale: Locale;
}

export const VerifyEmailEmail = ({
  name = 'John Doe',
  verificationUrl = 'https://knowtis.app/verify-email?token=preview-token',
  code = '123456',
  locale = DEFAULT_LOCALE,
}: VerifyEmailProps) => (
  <AuthEmailTemplate
    name={name}
    actionUrl={verificationUrl}
    code={code}
    locale={locale}
    translationKey={AUTH_TRANSLATION_KEY.VERIFY_EMAIL}
  />
);

export default VerifyEmailEmail;
