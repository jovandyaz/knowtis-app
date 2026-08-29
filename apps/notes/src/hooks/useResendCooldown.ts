import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AuthErrorCodes,
  VERIFICATION_RESEND_COOLDOWN_MS,
} from '@jovandyaz/auth';
import { useResendVerification } from '@jovandyaz/auth-react';

import { ApiClientError, retryAfterMsOf } from '@knowtis/api-client';

import { useCountdown } from './useCountdown';
import { isRateLimited } from './useRateLimitState';

const RESEND_LOCKED_OUT_KEY = 'verifyEmail.resendLockedOut';
const RESENT_FAILED_KEY = 'verifyEmail.resentFailed';
const ALREADY_VERIFIED_KEY = 'verifyEmail.alreadyVerified';

type ResendErrorKey =
  | typeof RESEND_LOCKED_OUT_KEY
  | typeof RESENT_FAILED_KEY
  | typeof ALREADY_VERIFIED_KEY;

export interface ResendNotice {
  tone: 'success' | 'error';
  message: string;
}

/** Everything a screen needs to offer another verification email, and no more. */
export interface ResendControls {
  onResend: () => void;
  isResending: boolean;
  /** True while the cooldown runs, and for good once the throttle locks out. */
  resendHeld: boolean;
  resendLabel: string;
  resendNotice: ResendNotice | undefined;
}

export interface ResendCooldown extends ResendControls {
  /** 0 once the cooldown has elapsed, even while the throttle still holds. */
  secondsLeft: number;
  /** Holds the resend for a wait another call's refusal named. */
  hold: (ms: number) => void;
}

export interface ResendCooldownOptions {
  /** False where no code was just sent, so the first send is one click away. */
  startHeld?: boolean;
  /** Runs when a new code is on its way, to clear what the old one left behind. */
  onSent?: () => void;
}

/** True only for the per-code cooldown, whose window this client can name. */
function isResendCooldown(error: unknown): boolean {
  return (
    ApiClientError.isApiClientError(error) &&
    error.code === AuthErrorCodes.RESEND_COOLDOWN
  );
}

function isAlreadyVerified(error: unknown): boolean {
  return (
    ApiClientError.isApiClientError(error) &&
    error.code === AuthErrorCodes.EMAIL_ALREADY_VERIFIED
  );
}

/**
 * The one resend affordance: the server cooldown it counts down, the endpoint
 * throttle it stops offering against, and what to say about either.
 */
export function useResendCooldown({
  startHeld = true,
  onSent,
}: ResendCooldownOptions = {}): ResendCooldown {
  const { t } = useTranslation('auth');
  const resendVerification = useResendVerification();
  const { secondsLeft, restart } = useCountdown(
    VERIFICATION_RESEND_COOLDOWN_MS,
    { startHeld }
  );
  const [lockedOut, setLockedOut] = useState(false);
  const [errorKey, setErrorKey] = useState<ResendErrorKey | undefined>();

  const cooldownHeld = secondsLeft > 0;

  const resendNotice: ResendNotice | undefined = resendVerification.isSuccess
    ? { tone: 'success', message: t('verifyEmail.resentSuccess') }
    : errorKey
      ? { tone: 'error', message: t(errorKey) }
      : undefined;

  const onResend = () => {
    setErrorKey(undefined);
    resendVerification.mutate(undefined, {
      onSuccess: () => {
        onSent?.();
        restart();
      },
      // The 3-per-15-minutes throttle counts refused requests too, so a
      // refusal has to hold the resend or three clicks lock the user out.
      // Its own Retry-After names minutes rather than seconds, so the throttle
      // withdraws the offer instead of rendering a countdown nobody waits out.
      // The cooldown keeps no notice: the button counts its wait down already.
      onError: (error) => {
        if (isResendCooldown(error)) {
          restart(retryAfterMsOf(error));
          return;
        }
        if (isAlreadyVerified(error)) {
          setLockedOut(true);
          setErrorKey(ALREADY_VERIFIED_KEY);
          return;
        }
        if (isRateLimited(error)) {
          setLockedOut(true);
          setErrorKey(RESEND_LOCKED_OUT_KEY);
          return;
        }
        setErrorKey(RESENT_FAILED_KEY);
      },
    });
  };

  return {
    onResend,
    isResending: resendVerification.isPending,
    resendHeld: cooldownHeld || lockedOut,
    resendLabel: cooldownHeld
      ? t('verifyEmail.resendCountdown', { seconds: secondsLeft })
      : t('verifyEmail.resendButton'),
    resendNotice,
    secondsLeft,
    hold: restart,
  };
}
