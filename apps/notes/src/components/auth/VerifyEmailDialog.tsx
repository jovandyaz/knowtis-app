import { useTranslation } from 'react-i18next';

import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { VERIFICATION_CODE_LENGTH } from '@jovandyaz/auth';
import { useAuthUser } from '@jovandyaz/auth-react';
import { toast } from 'sonner';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@knowtis/design-system';

import { OtpCodeField } from './OtpCodeField';
import { ResendCodeButton } from './ResendCodeButton';
import { ResendNoticeAlert } from './ResendNoticeAlert';
import { useVerifyEmailCodeForm } from './useVerifyEmailCodeForm';
import { VerifyCodeSubmitButton } from './VerifyCodeSubmitButton';

const CODE_FIELD_ID = 'verify-email-dialog-code';

function VerifyEmailDialogForm({ onVerified }: { onVerified: () => void }) {
  const { t } = useTranslation('auth');
  const email = useAuthUser()?.email ?? '';
  const source = useVerifyEmailStore((s) => s.source);
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
          {source === 'emailLink' && (
            <span className="mb-3 block rounded-md bg-(--primary)/10 p-3 text-(--foreground)">
              {t('verifyEmail.emailLinkNotice')}
            </span>
          )}
          {t('verifyEmail.gateDialogDesc', {
            email,
            length: VERIFICATION_CODE_LENGTH,
          })}
        </DialogDescription>
      </DialogHeader>

      <form onSubmit={form.onSubmit} noValidate className="space-y-4">
        <OtpCodeField id={CODE_FIELD_ID} form={form} />
        <ResendNoticeAlert notice={form.resendNotice} />

        <DialogFooter>
          <ResendCodeButton resend={form} />
          <VerifyCodeSubmitButton form={form} />
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
