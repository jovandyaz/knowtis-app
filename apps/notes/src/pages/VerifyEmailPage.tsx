import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Link, useNavigate, useSearch } from '@tanstack/react-router';

import { ResendCodeButton } from '@/components/auth/ResendCodeButton';
import { ResendNoticeAlert } from '@/components/auth/ResendNoticeAlert';
import { ROUTES } from '@/config';
import { isRateLimited } from '@/hooks/useRateLimitState';
import { useResendCooldown } from '@/hooks/useResendCooldown';
import { useVerifyEmailGate } from '@/hooks/useVerifyEmailGate';
import { useVerifyEmail } from '@jovandyaz/auth-react';
import { AlertCircle, ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { ApiClientError } from '@knowtis/api-client';
import {
  Button,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@knowtis/design-system';

import { AuthPageLayout } from './AuthPageLayout';

export function VerifyEmailPage() {
  const { t } = useTranslation('auth');
  const { token } = useSearch({ from: '/verify-email' });
  const verifyEmail = useVerifyEmail();
  // No code was just sent from this screen, so the first send is one click away.
  const resend = useResendCooldown({ startHeld: false });
  const { canVerify } = useVerifyEmailGate();
  const navigate = useNavigate();
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (token && !hasAttempted.current) {
      hasAttempted.current = true;
      verifyEmail.mutate(token, {
        onSuccess: () => {
          toast.success(t('verifyEmail.verifiedToast'));
        },
        // The token must not survive in history or in a referrer header.
        onSettled: () => {
          void navigate({
            to: ROUTES.VERIFY_EMAIL,
            search: {},
            replace: true,
          });
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Scrubbing the token empties `token`, so only a bare visit is a bad link.
  if (!token && !hasAttempted.current) {
    return (
      <AuthPageLayout>
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--destructive)/10">
            <AlertCircle className="h-6 w-6 text-(--destructive)" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {t('verifyEmail.invalidLink')}
          </CardTitle>
          <CardDescription>{t('verifyEmail.invalidLinkDesc')}</CardDescription>
        </CardHeader>

        <CardFooter>
          <Link
            to={ROUTES.LOGIN}
            search={{ redirect: undefined }}
            className="flex w-full items-center justify-center gap-2 text-sm font-medium text-(--muted-foreground) hover:text-(--foreground)"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('verifyEmail.backToLogin')}
          </Link>
        </CardFooter>
      </AuthPageLayout>
    );
  }

  if (verifyEmail.isPending) {
    return (
      <AuthPageLayout>
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--primary)/10">
            <Loader2 className="h-6 w-6 animate-spin text-(--primary)" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {t('verifyEmail.verifyingTitle')}
          </CardTitle>
          <CardDescription aria-live="polite">
            {t('verifyEmail.verifyingDesc')}
          </CardDescription>
        </CardHeader>
      </AuthPageLayout>
    );
  }

  if (verifyEmail.isSuccess) {
    return (
      <AuthPageLayout>
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--primary)/10">
            <CheckCircle className="h-6 w-6 text-(--primary)" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {t('verifyEmail.verifiedTitle')}
          </CardTitle>
          <CardDescription>{t('verifyEmail.verifiedDesc')}</CardDescription>
        </CardHeader>

        <CardFooter>
          <Link
            to={ROUTES.LOGIN}
            search={{ redirect: undefined }}
            className="w-full"
          >
            <Button className="w-full">{t('login.button')}</Button>
          </Link>
        </CardFooter>
      </AuthPageLayout>
    );
  }

  const errorMessage = getVerifyErrorMessage(verifyEmail.error);

  return (
    <AuthPageLayout>
      <CardHeader className="space-y-1 text-center">
        <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--destructive)/10">
          <AlertCircle className="h-6 w-6 text-(--destructive)" />
        </div>
        <CardTitle className="text-2xl font-bold tracking-tight">
          {t('verifyEmail.failedTitle')}
        </CardTitle>
        <CardDescription>
          <span role="alert" aria-live="polite">
            {t(errorMessage)}
          </span>
        </CardDescription>
      </CardHeader>

      {canVerify && (
        <CardContent className="space-y-4">
          <ResendCodeButton resend={resend} className="w-full" />
          <ResendNoticeAlert notice={resend.resendNotice} />
        </CardContent>
      )}

      <CardFooter>
        <Link
          to={ROUTES.LOGIN}
          search={{ redirect: undefined }}
          className="flex w-full items-center justify-center gap-2 text-sm font-medium text-(--muted-foreground) hover:text-(--foreground)"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('verifyEmail.backToLogin')}
        </Link>
      </CardFooter>
    </AuthPageLayout>
  );
}

function getVerifyErrorMessage(
  error: Error | null
):
  | 'verifyEmail.genericError'
  | 'verifyEmail.invalidOrExpired'
  | 'verifyEmail.alreadyVerified'
  | 'verifyEmail.codeThrottled' {
  if (!error) {
    return 'verifyEmail.genericError';
  }

  if (ApiClientError.isApiClientError(error)) {
    if (error.status === 400 || error.status === 404) {
      return 'verifyEmail.invalidOrExpired';
    }
    if (error.status === 409) {
      return 'verifyEmail.alreadyVerified';
    }
  }
  if (isRateLimited(error)) {
    return 'verifyEmail.codeThrottled';
  }

  return 'verifyEmail.genericError';
}
