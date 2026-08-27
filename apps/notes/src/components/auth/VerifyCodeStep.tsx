import { useTranslation } from 'react-i18next';

import { Mail } from 'lucide-react';

import {
  Button,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  LoadingButton,
} from '@knowtis/design-system';

import { OtpCodeInput } from './OtpCodeInput';
import { ResendNoticeAlert } from './ResendNoticeAlert';
import { useVerifyEmailCodeForm } from './useVerifyEmailCodeForm';

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
          {t('verifyEmail.sentCodeTo')}{' '}
          <span className="font-medium text-(--foreground)">{email}</span>
        </CardDescription>
      </CardHeader>

      <form onSubmit={form.onSubmit} noValidate>
        <CardContent className="space-y-4">
          <FormField
            id={CODE_FIELD_ID}
            label={t('verifyEmail.codeLabel')}
            error={form.errorMessage}
          >
            <OtpCodeInput
              id={CODE_FIELD_ID}
              value={form.code}
              onChange={form.onCodeChange}
              placeholder={t('verifyEmail.codePlaceholder')}
              autoFocus
              aria-invalid={!!form.errorMessage}
              aria-describedby={
                form.errorMessage ? `${CODE_FIELD_ID}-error` : undefined
              }
            />
          </FormField>

          <ResendNoticeAlert notice={form.resendNotice} />
        </CardContent>

        <CardFooter className="flex flex-col gap-3">
          <LoadingButton
            type="submit"
            className="h-11 w-full sm:h-10"
            loading={form.isVerifying}
            loadingText={t('verifyEmail.verifyingCode')}
            disabled={!form.canSubmit}
          >
            {t('verifyEmail.verifyCodeButton')}
          </LoadingButton>

          <p className="text-center text-sm text-(--muted-foreground)">
            {t('verifyEmail.checkSpam')}
          </p>

          <LoadingButton
            type="button"
            variant="outline"
            className="h-11 w-full sm:h-10"
            loading={form.isResending}
            loadingText={t('verifyEmail.sendingButton')}
            disabled={form.resendHeld}
            onClick={form.onResend}
          >
            <Mail className="mr-2 h-4 w-4" />
            {form.resendLabel}
          </LoadingButton>

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
