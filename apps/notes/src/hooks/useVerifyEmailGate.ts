import { useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useVerifyEmailStore } from '@/stores/verify-email.store';
import { useAuthUser } from '@jovandyaz/auth-react';
import { toast } from 'sonner';

import { isEmailNotVerifiedError } from '@knowtis/api-client';

const SIGN_UP_TOAST_KEY = 'verifyEmail.gateSignUpToast';

export interface VerifyEmailGate {
  /** False for a visitor with no address, who is offered an account instead. */
  canVerify: boolean;
  /** Answers the refusal: the code dialog, or the account a visitor lacks. */
  prompt: () => void;
  /** Same for an API refusal — false leaves an unrelated failure to the caller. */
  handleError: (error: unknown) => boolean;
}

/**
 * The single place that decides what a gated refusal offers. An anonymous
 * visitor, and a visitor with no session at all, are refused by the same server
 * gate but have no address to verify, so the only way forward they can take is
 * creating an account.
 */
export function useVerifyEmailGate(): VerifyEmailGate {
  const { t } = useTranslation('auth');
  const user = useAuthUser();
  const open = useVerifyEmailStore((s) => s.open);

  const canVerify = !!user && !user.isAnonymous;

  const prompt = useCallback(() => {
    if (!canVerify) {
      toast.error(t(SIGN_UP_TOAST_KEY));
      return;
    }
    open();
  }, [canVerify, open, t]);

  const handleError = useCallback(
    (error: unknown) => {
      if (!isEmailNotVerifiedError(error)) {
        return false;
      }
      prompt();
      return true;
    },
    [prompt]
  );

  return useMemo(
    () => ({ canVerify, prompt, handleError }),
    [canVerify, prompt, handleError]
  );
}
