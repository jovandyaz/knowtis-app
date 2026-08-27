import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { useCountdown } from '@/hooks/useCountdown';
import { useRateLimitState } from '@/hooks/useRateLimitState';
import {
  AuthErrorCodes,
  VERIFICATION_CODE_LENGTH,
  VERIFICATION_RESEND_COOLDOWN_MS,
} from '@jovandyaz/auth';
import {
  useResendVerification,
  useVerifyEmailCode,
} from '@jovandyaz/auth-react';

import { ApiClientError } from '@knowtis/api-client';

const CODE_INVALID_KEY = 'verifyEmail.codeInvalid';
const RATE_LIMIT_KEY = 'verifyEmail.rateLimitToast';
const RESEND_LOCKED_OUT_KEY = 'verifyEmail.resendLockedOut';
const RESENT_FAILED_KEY = 'verifyEmail.resentFailed';
const ATTEMPTS_SPENT_KEY = 'verifyEmail.codeTooManyAttempts';
const ATTEMPTS_SPENT_WAIT_KEY = 'verifyEmail.codeTooManyAttemptsWait';
const GENERIC_ERROR_KEY = 'verifyEmail.genericError';

type VerifyErrorKey =
  | typeof CODE_INVALID_KEY
  | typeof ATTEMPTS_SPENT_KEY
  | typeof GENERIC_ERROR_KEY;

type ResendErrorKey =
  | typeof RATE_LIMIT_KEY
  | typeof RESEND_LOCKED_OUT_KEY
  | typeof RESENT_FAILED_KEY;

export interface ResendNotice {
  tone: 'success' | 'error';
  message: string;
}

export interface VerifyEmailCodeFormOptions {
  onVerified: () => void;
  /** False where no code was just sent, so the first send is one click away. */
  startHeld?: boolean;
}

/** The resend half on its own, for a screen that has no code to enter. */
export interface ResendControls {
  onResend: () => void;
  isResending: boolean;
  /** True while the cooldown runs, and for good once the throttle locks out. */
  resendHeld: boolean;
  resendLabel: string;
  resendNotice: ResendNotice | undefined;
}

export interface VerifyEmailCodeForm extends ResendControls {
  code: string;
  onCodeChange: (code: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isVerifying: boolean;
  canSubmit: boolean;
  errorMessage: string | undefined;
}

/** True only for the per-code cooldown, whose window this client can name. */
function isResendCooldown(error: unknown): boolean {
  return (
    ApiClientError.isApiClientError(error) &&
    error.code === AuthErrorCodes.RESEND_COOLDOWN
  );
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
function resendErrorKey(
  lockedOut: boolean,
  rateLimited: boolean
): ResendErrorKey {
  if (lockedOut) {
    return RESEND_LOCKED_OUT_KEY;
  }
  return rateLimited ? RATE_LIMIT_KEY : RESENT_FAILED_KEY;
}

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
  const [lockedOut, setLockedOut] = useState(false);

  const errorKey = verifyErrorKey(verifyCode.error);
  // The server gates the resend purely on elapsed time, so nothing but the
  // countdown may release it — a spent attempt budget least of all.
  const cooldownHeld = secondsLeft > 0;
  const resendHeld = cooldownHeld || lockedOut;

  // A spent budget does not lift the cooldown: the spent row survives on the
  // server precisely because the cooldown keys off it, so a resend inside the
  // window is refused. Name the wait rather than offer a rejected action.
  const attemptsSpentMessage = attemptsSpent
    ? t(cooldownHeld ? ATTEMPTS_SPENT_WAIT_KEY : ATTEMPTS_SPENT_KEY, {
        seconds: secondsLeft,
      })
    : undefined;

  const resendNotice: ResendNotice | undefined = resendVerification.isSuccess
    ? { tone: 'success', message: t('verifyEmail.resentSuccess') }
    : resendVerification.isError
      ? { tone: 'error', message: t(resendErrorKey(lockedOut, rateLimited)) }
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
      // refusal has to hold the resend or three clicks lock the user out.
      // Only the cooldown has a window worth counting down: re-arming 60s
      // against the throttle would just invite the click that spends the
      // next slot.
      onError: (error) => {
        if (!checkRateLimit(error)) {
          return;
        }
        if (isResendCooldown(error)) {
          restart();
        } else {
          setLockedOut(true);
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
    resendLabel: cooldownHeld
      ? t('verifyEmail.resendCountdown', { seconds: secondsLeft })
      : t('verifyEmail.resendButton'),
    resendNotice,
  };
}
