import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

import { Link, useSearch } from '@tanstack/react-router';

import {
  useIsAuthenticated,
  useResendVerification,
  useVerifyEmail,
} from '@jovandyaz/auth-react';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Loader2,
  Mail,
} from 'lucide-react';
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
  const resendVerification = useResendVerification();
  const isAuthenticated = useIsAuthenticated();
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (token && !hasAttempted.current) {
      hasAttempted.current = true;
      verifyEmail.mutate(token, {
        onSuccess: () => {
          toast.success(t('verifyEmail.verifiedToast'));
        },
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) {
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
            to="/login"
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
          <Link to="/login" search={{ redirect: undefined }} className="w-full">
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

      <CardContent className="space-y-4">
        {isAuthenticated && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() =>
              resendVerification.mutate(undefined, {
                onSuccess: () => {
                  toast.success(t('verifyEmail.emailSentToast'));
                },
                onError: (error) => {
                  if (
                    ApiClientError.isApiClientError(error) &&
                    error.status === 429
                  ) {
                    toast.error(t('verifyEmail.rateLimitToast'));
                  }
                },
              })
            }
            disabled={resendVerification.isPending}
          >
            {resendVerification.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {t('verifyEmail.sendingButton')}
              </>
            ) : (
              <>
                <Mail className="mr-2 h-4 w-4" />
                {t('verifyEmail.resendButton')}
              </>
            )}
          </Button>
        )}

        {resendVerification.isSuccess && (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-md bg-(--primary)/10 p-3 text-center text-sm text-(--primary)"
          >
            {t('verifyEmail.resentSuccessCheckInbox')}
          </div>
        )}

        {resendVerification.isError && (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-md bg-(--destructive)/10 p-3 text-center text-sm text-(--destructive)"
          >
            {ApiClientError.isApiClientError(resendVerification.error) &&
            resendVerification.error.status === 429
              ? t('verifyEmail.rateLimitToast')
              : t('verifyEmail.resentFailed')}
          </div>
        )}
      </CardContent>

      <CardFooter>
        <Link
          to="/login"
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
  | 'verifyEmail.alreadyVerified' {
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

  return 'verifyEmail.genericError';
}
