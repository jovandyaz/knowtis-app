import { useTranslation } from 'react-i18next';

import { Mail } from 'lucide-react';

import { cn, LoadingButton } from '@knowtis/design-system';

import type { ResendControls } from './useVerifyEmailCodeForm';

export interface ResendCodeButtonProps {
  resend: ResendControls;
  className?: string;
}

export function ResendCodeButton({ resend, className }: ResendCodeButtonProps) {
  const { t } = useTranslation('auth');

  return (
    <LoadingButton
      type="button"
      variant="outline"
      className={cn('h-11 sm:h-10', className)}
      loading={resend.isResending}
      loadingText={t('verifyEmail.sendingButton')}
      disabled={resend.resendHeld}
      onClick={resend.onResend}
    >
      <Mail className="mr-2 h-4 w-4" />
      {resend.resendLabel}
    </LoadingButton>
  );
}
