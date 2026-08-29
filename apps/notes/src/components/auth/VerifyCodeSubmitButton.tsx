import { useTranslation } from 'react-i18next';

import { cn, LoadingButton } from '@knowtis/design-system';

import type { VerifyEmailCodeForm } from './useVerifyEmailCodeForm';

export interface VerifyCodeSubmitButtonProps {
  form: VerifyEmailCodeForm;
  className?: string;
}

export function VerifyCodeSubmitButton({
  form,
  className,
}: VerifyCodeSubmitButtonProps) {
  const { t } = useTranslation('auth');

  return (
    <LoadingButton
      type="submit"
      className={cn('h-11 sm:h-10', className)}
      loading={form.isVerifying}
      loadingText={t('verifyEmail.verifyingCode')}
      disabled={!form.canSubmit}
    >
      {t('verifyEmail.verifyCodeButton')}
    </LoadingButton>
  );
}
