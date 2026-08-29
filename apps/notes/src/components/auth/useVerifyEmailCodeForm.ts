import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { isRateLimited } from '@/hooks/useRateLimitState';
import {
  useResendCooldown,
  type ResendControls,
} from '@/hooks/useResendCooldown';
import { AuthErrorCodes, VERIFICATION_CODE_LENGTH } from '@jovandyaz/auth';
import { useVerifyEmailCode } from '@jovandyaz/auth-react';

import { ApiClientError, retryAfterMsOf } from '@knowtis/api-client';

const CODE_INVALID_KEY = 'verifyEmail.codeInvalid';
const ATTEMPTS_SPENT_KEY = 'verifyEmail.codeTooManyAttempts';
const ATTEMPTS_SPENT_WAIT_KEY = 'verifyEmail.codeTooManyAttemptsWait';
const CODE_THROTTLED_KEY = 'verifyEmail.codeThrottled';
const GENERIC_ERROR_KEY = 'verifyEmail.genericError';

type VerifyErrorKey =
  | typeof CODE_INVALID_KEY
  | typeof ATTEMPTS_SPENT_KEY
  | typeof CODE_THROTTLED_KEY
  | typeof GENERIC_ERROR_KEY;

export interface VerifyEmailCodeFormOptions {
  onVerified: () => void;
  /** False where no code was just sent, so the first send is one click away. */
  startHeld?: boolean;
}

export interface VerifyEmailCodeForm extends ResendControls {
  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isVerifying: boolean;
  canSubmit: boolean;
  errorMessage: string | undefined;
}

function verifyErrorKey(error: Error | null): VerifyErrorKey | undefined {
  if (!error) {
    return undefined;
  }

  if (ApiClientError.isApiClientError(error)) {
    if (error.code === AuthErrorCodes.INVALID_VERIFICATION_CODE) {
      return CODE_INVALID_KEY;
    }
    if (error.code === AuthErrorCodes.TOO_MANY_VERIFICATION_ATTEMPTS) {
      return ATTEMPTS_SPENT_KEY;
    }
  }
  if (isRateLimited(error)) {
    return CODE_THROTTLED_KEY;
  }

  return GENERIC_ERROR_KEY;
}

/**
 * The code-entry interaction shared by the registration step and the in-app
 * dialog: submit, the attempt-cap copy, and the shared resend affordance.
 */
export function useVerifyEmailCodeForm({
  onVerified,
  startHeld = true,
}: VerifyEmailCodeFormOptions): VerifyEmailCodeForm {
  const { t } = useTranslation('auth');
  const verifyCode = useVerifyEmailCode();
  const [code, setCode] = useState('');
  const [attemptsSpent, setAttemptsSpent] = useState(false);

  const resend = useResendCooldown({
    startHeld,
    onSent: () => {
      setCode('');
      setAttemptsSpent(false);
      verifyCode.reset();
    },
  });

  const errorKey = verifyErrorKey(verifyCode.error);
  const cooldownHeld = resend.secondsLeft > 0;

  // A spent budget does not lift the cooldown: the spent row survives on the
  // server precisely because the cooldown keys off it, so a resend inside the
  // window is refused. Name the wait rather than offer a rejected action.
  const attemptsSpentMessage = attemptsSpent
    ? t(cooldownHeld ? ATTEMPTS_SPENT_WAIT_KEY : ATTEMPTS_SPENT_KEY, {
        seconds: resend.secondsLeft,
      })
    : undefined;

  const onCodeChange = (next: string) => {
    setCode(next);
    if (verifyCode.error) {
      verifyCode.reset();
    }
  };

  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    verifyCode.mutate(code, {
      onSuccess: onVerified,
      onError: (error) => {
        if (verifyErrorKey(error) !== ATTEMPTS_SPENT_KEY) {
          return;
        }
        setAttemptsSpent(true);
        // A resend is the only way out of a spent budget, so this refusal
        // quotes the wait until one is possible rather than its own.
        const wait = retryAfterMsOf(error);
        if (wait !== undefined) {
          resend.hold(wait);
        }
      },
    });
  };

  return {
    ...resend,
    code,
    onCodeChange,
    onSubmit,
    isVerifying: verifyCode.isPending,
    canSubmit: code.length >= VERIFICATION_CODE_LENGTH,
    errorMessage: attemptsSpentMessage ?? (errorKey ? t(errorKey) : undefined),
  };
}
