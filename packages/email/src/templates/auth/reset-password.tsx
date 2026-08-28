import { DEFAULT_LOCALE, type Locale } from '../../i18n/config';
import { AUTH_TRANSLATION_KEY, AuthEmailTemplate } from './auth-email-template';

interface ResetPasswordProps {
  name: string;
  resetUrl: string;
  locale: Locale;
}

export const ResetPasswordEmail = ({
  name = 'John Doe',
  resetUrl = 'https://knowtis.app/reset-password?token=preview-token',
  locale = DEFAULT_LOCALE,
}: ResetPasswordProps) => (
  <AuthEmailTemplate
    name={name}
    actionUrl={resetUrl}
    locale={locale}
    translationKey={AUTH_TRANSLATION_KEY.RESET_PASSWORD}
  />
);

export default ResetPasswordEmail;
