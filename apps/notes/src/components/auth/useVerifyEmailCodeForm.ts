import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useCountdown } from '@/hooks/useCountdown';
import {
  AuthErrorCodes,
  VERIFICATION_RESEND_COOLDOWN_MS,
} from '@jovandyaz/auth';
import {
  useRateLimitState,
  useResendVerification,
  useVerifyEmailCode,
} from '@jovandyaz/auth-react';

import { ApiClientError } from '@knowtis/api-client';

import { VERIFICATION_CODE_LENGTH } from './OtpCodeInput';

const CODE_INVALID_KEY = 'verifyEmail.codeInvalid';
const ATTEMPTS_SPENT_KEY = 'verifyEmail.codeTooManyAttempts';
const ATTEMPTS_SPENT_WAIT_KEY = 'verifyEmail.codeTooManyAttemptsWait';
const GENERIC_ERROR_KEY = 'verifyEmail.genericError';

type VerifyErrorKey =
  | typeof CODE_INVALID_KEY
  | typeof ATTEMPTS_SPENT_KEY
  | typeof GENERIC_ERROR_KEY;

export interface ResendNotice {
  tone: 'success' | 'error';
  message: string;
}

export interface VerifyEmailCodeFormOptions {
  onVerified: () => void;
  /** False where no code was just sent, so the first send is one click away. */
  startHeld?: boolean;
}

export interface VerifyEmailCodeForm {
  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isVerifying: boolean;
  canSubmit: boolean;
  errorMessage: string | undefined;
  onResend: () => void;
  isResending: boolean;
  resendHeld: boolean;
  resendLabel: string;
  resendNotice: ResendNotice | undefined;
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

  return GENERIC_ERROR_KEY;
}

/**
 * The code-entry interaction shared by the registration step and the in-app
 * dialog: submit, the attempt-cap copy, and a resend the server cooldown holds.
 */
export function useVerifyEmailCodeForm({
  onVerified,
  startHeld = true,
}: VerifyEmailCodeFormOptions): VerifyEmailCodeForm {
  const { t } = useTranslation('auth');
  const verifyCode = useVerifyEmailCode();
  const resendVerification = useResendVerification();
  const { rateLimited, checkRateLimit, resetRateLimit } = useRateLimitState();
  const { secondsLeft, restart } = useCountdown(
    VERIFICATION_RESEND_COOLDOWN_MS,
    {
      startHeld,
    }
  );
  const [code, setCode] = useState('');
  const [attemptsSpent, setAttemptsSpent] = useState(false);

  const errorKey = verifyErrorKey(verifyCode.error);
  // The server gates the resend purely on elapsed time, so nothing but the
  // countdown may release it — a spent attempt budget least of all.
  const resendHeld = secondsLeft > 0;

  // A spent budget does not lift the cooldown: the spent row survives on the
  // server precisely because the cooldown keys off it, so a resend inside the
  // window is refused. Name the wait rather than offer a rejected action.
  const attemptsSpentMessage = attemptsSpent
    ? t(resendHeld ? ATTEMPTS_SPENT_WAIT_KEY : ATTEMPTS_SPENT_KEY, {
        seconds: secondsLeft,
      })
    : undefined;

  const resendNotice: ResendNotice | undefined = resendVerification.isSuccess
    ? { tone: 'success', message: t('verifyEmail.resentSuccess') }
    : resendVerification.isError
      ? {
          tone: 'error',
          message: rateLimited
            ? t('verifyEmail.rateLimitToast')
            : t('verifyEmail.resentFailed'),
        }
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
        if (verifyErrorKey(error) === ATTEMPTS_SPENT_KEY) {
          setAttemptsSpent(true);
        }
      },
    });
  };

  const onResend = () => {
    resetRateLimit();
    resendVerification.mutate(undefined, {
      onSuccess: () => {
        setCode('');
        setAttemptsSpent(false);
        verifyCode.reset();
        restart();
      },
      // The 3-per-15-minutes throttle counts refused requests too, so a
      // refusal has to arm the hold or three clicks lock the user out.
      onError: (error) => {
        if (checkRateLimit(error)) {
          restart();
        }
      },
    });
  };

  return {
    code,
    onCodeChange,
    onSubmit,
    isVerifying: verifyCode.isPending,
    canSubmit: code.length >= VERIFICATION_CODE_LENGTH,
    errorMessage: attemptsSpentMessage ?? (errorKey ? t(errorKey) : undefined),
    onResend,
    isResending: resendVerification.isPending,
    resendHeld,
    resendLabel: resendHeld
      ? t('verifyEmail.resendCountdown', { seconds: secondsLeft })
      : t('verifyEmail.resendButton'),
    resendNotice,
  };
}
