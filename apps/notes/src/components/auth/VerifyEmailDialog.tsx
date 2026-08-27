import { useTranslation } from 'react-i18next';

import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { VERIFICATION_CODE_LENGTH } from '@jovandyaz/auth';
import { useAuthUser } from '@jovandyaz/auth-react';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormField,
  LoadingButton,
} from '@knowtis/design-system';

import { OtpCodeInput } from './OtpCodeInput';
import { ResendNoticeAlert } from './ResendNoticeAlert';
import { useVerifyEmailCodeForm } from './useVerifyEmailCodeForm';

const CODE_FIELD_ID = 'verify-email-dialog-code';

function VerifyEmailDialogForm({ onVerified }: { onVerified: () => void }) {
  const { t } = useTranslation('auth');
  const email = useAuthUser()?.email ?? '';
  // No code was just sent — the user may be days past registration — so the
  // first send must be one click away rather than held by a phantom cooldown.
  const form = useVerifyEmailCodeForm({
    onVerified: () => {
      toast.success(t('verifyEmail.verifiedToast'));
      onVerified();
    },
    startHeld: false,
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('verifyEmail.gateDialogTitle')}</DialogTitle>
        <DialogDescription>
          {t('verifyEmail.gateDialogDesc', {
            email,
            length: VERIFICATION_CODE_LENGTH,
          })}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={form.onSubmit} noValidate className="space-y-4">
        <FormField
          id={CODE_FIELD_ID}
          label={t('verifyEmail.codeLabel')}
          error={form.errorMessage}
        >
          <OtpCodeInput
            id={CODE_FIELD_ID}
            value={form.code}
            onChange={form.onCodeChange}
            autoFocus
            aria-invalid={!!form.errorMessage}
            aria-describedby={
              form.errorMessage ? `${CODE_FIELD_ID}-error` : undefined
            }
          />
        </FormField>

        <ResendNoticeAlert notice={form.resendNotice} />

        <DialogFooter>
          <LoadingButton
            type="button"
            variant="outline"
            className="h-11 sm:h-10"
            loading={form.isResending}
            loadingText={t('verifyEmail.sendingButton')}
            disabled={form.resendHeld}
            onClick={form.onResend}
          >
            <Mail className="mr-2 h-4 w-4" />
            {form.resendLabel}
          </LoadingButton>

          <LoadingButton
            type="submit"
            className="h-11 sm:h-10"
            loading={form.isVerifying}
            loadingText={t('verifyEmail.verifyingCode')}
            disabled={!form.canSubmit}
          >
            {t('verifyEmail.verifyCodeButton')}
          </LoadingButton>
        </DialogFooter>
      </form>
    </>
  );
}

/**
 * The in-place verification flow. Its body mounts only while open, so a
 * half-typed code or a spent resend never survives into the next opening.
 */
export function VerifyEmailDialog() {
  const isOpen = useVerifyEmailStore((s) => s.isOpen);
  const close = useVerifyEmailStore((s) => s.close);

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
    >
      <DialogContent className="max-w-md">
        <VerifyEmailDialogForm onVerified={close} />
      </DialogContent>
    </Dialog>
  );
}
