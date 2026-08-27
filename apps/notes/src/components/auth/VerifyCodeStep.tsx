import { useTranslation } from 'react-i18next';

import { VERIFICATION_CODE_LENGTH } from '@jovandyaz/auth';
import { Mail } from 'lucide-react';

import {
  Button,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@knowtis/design-system';

import { OtpCodeField } from './OtpCodeField';
import { ResendCodeButton } from './ResendCodeButton';
import { ResendNoticeAlert } from './ResendNoticeAlert';
import { useVerifyEmailCodeForm } from './useVerifyEmailCodeForm';
import { VerifyCodeSubmitButton } from './VerifyCodeSubmitButton';

const CODE_FIELD_ID = 'verification-code';

export interface VerifyCodeStepProps {
  email: string;
  onVerified: () => void;
  onSkip: () => void;
}

export function VerifyCodeStep({
  email,
  onVerified,
  onSkip,
}: VerifyCodeStepProps) {
  const { t } = useTranslation('auth');
  const form = useVerifyEmailCodeForm({ onVerified });

  return (
    <>
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--primary)/10">
          <Mail className="h-6 w-6 text-(--primary)" />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">
          {t('verifyEmail.checkEmail')}
        </CardTitle>
        <CardDescription>
          {t('verifyEmail.sentCodeTo', { length: VERIFICATION_CODE_LENGTH })}{' '}
          <span className="font-medium text-(--foreground)">{email}</span>
        </CardDescription>
      </CardHeader>

      <form onSubmit={form.onSubmit} noValidate>
        <CardContent className="space-y-4">
          <OtpCodeField id={CODE_FIELD_ID} form={form} />
          <ResendNoticeAlert notice={form.resendNotice} />
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <VerifyCodeSubmitButton form={form} className="w-full" />

          <p className="text-center text-sm text-(--muted-foreground)">
            {t('verifyEmail.checkSpam')}
          </p>

          <ResendCodeButton resend={form} className="w-full" />

          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full sm:h-10"
            onClick={onSkip}
          >
            {t('verifyEmail.skipForNow')}
          </Button>
        </CardFooter>
      </form>
    </>
  );
}
