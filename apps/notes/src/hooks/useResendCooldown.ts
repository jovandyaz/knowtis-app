import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
  AuthErrorCodes,
  VERIFICATION_RESEND_COOLDOWN_MS,
} from '@jovandyaz/auth';
import { useResendVerification } from '@jovandyaz/auth-react';

import { ApiClientError } from '@knowtis/api-client';

import { useCountdown } from './useCountdown';
import { useRateLimitState } from './useRateLimitState';

const RATE_LIMIT_KEY = 'verifyEmail.rateLimitToast';
const RESEND_LOCKED_OUT_KEY = 'verifyEmail.resendLockedOut';
const RESENT_FAILED_KEY = 'verifyEmail.resentFailed';

type ResendErrorKey =
  | typeof RATE_LIMIT_KEY
  | typeof RESEND_LOCKED_OUT_KEY
  | typeof RESENT_FAILED_KEY;

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

function resendErrorKey(
  lockedOut: boolean,
  rateLimited: boolean
): ResendErrorKey {
  if (lockedOut) {
    return RESEND_LOCKED_OUT_KEY;
  }
  return rateLimited ? RATE_LIMIT_KEY : RESENT_FAILED_KEY;
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
  const { rateLimited, checkRateLimit, resetRateLimit } = useRateLimitState();
  const { secondsLeft, restart } = useCountdown(
    VERIFICATION_RESEND_COOLDOWN_MS,
    { startHeld }
  );
  const [lockedOut, setLockedOut] = useState(false);

  const cooldownHeld = secondsLeft > 0;

  const resendNotice: ResendNotice | undefined = resendVerification.isSuccess
    ? { tone: 'success', message: t('verifyEmail.resentSuccess') }
    : resendVerification.isError
      ? { tone: 'error', message: t(resendErrorKey(lockedOut, rateLimited)) }
      : undefined;

  const onResend = () => {
    resetRateLimit();
    resendVerification.mutate(undefined, {
      onSuccess: () => {
        onSent?.();
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
    onResend,
    isResending: resendVerification.isPending,
    resendHeld: cooldownHeld || lockedOut,
    resendLabel: cooldownHeld
      ? t('verifyEmail.resendCountdown', { seconds: secondsLeft })
      : t('verifyEmail.resendButton'),
    resendNotice,
    secondsLeft,
  };
}
