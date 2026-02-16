import { useEffect, useRef } from 'react';

import { Link, useSearch } from '@tanstack/react-router';

import { PublicRoute } from '@/components/auth';
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle,
  Loader2,
  Mail,
} from 'lucide-react';

import { ApiClientError } from '@knowtis/api-client';
import {
  useIsAuthenticated,
  useResendVerification,
  useVerifyEmail,
} from '@knowtis/auth';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@knowtis/design-system';

export function VerifyEmailPage() {
  const { token } = useSearch({ from: '/verify-email' });
  const verifyEmail = useVerifyEmail();
  const resendVerification = useResendVerification();
  const isAuthenticated = useIsAuthenticated();
  const hasAttempted = useRef(false);

  useEffect(() => {
    if (token && !hasAttempted.current) {
      hasAttempted.current = true;
      verifyEmail.mutate(token);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!token) {
    return (
      <PublicRoute>
        <div className="flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-md border-border/50 bg-card/95 backdrop-blur-sm">
            <CardHeader className="space-y-1 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--destructive)/10">
                <AlertCircle className="h-6 w-6 text-(--destructive)" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">
                Invalid verification link
              </CardTitle>
              <CardDescription>
                This email verification link is invalid or missing. Please check
                your email for the correct link.
              </CardDescription>
            </CardHeader>

            <CardFooter>
              <Link
                to="/login"
                className="flex w-full items-center justify-center gap-2 text-sm font-medium text-(--muted-foreground) hover:text-(--foreground)"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>
            </CardFooter>
          </Card>
        </div>
      </PublicRoute>
    );
  }

  if (verifyEmail.isPending) {
    return (
      <PublicRoute>
        <div className="flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-md border-border/50 bg-card/95 backdrop-blur-sm">
            <CardHeader className="space-y-1 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--primary)/10">
                <Loader2 className="h-6 w-6 animate-spin text-(--primary)" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">
                Verifying your email
              </CardTitle>
              <CardDescription aria-live="polite">
                Please wait while we verify your email address...
              </CardDescription>
            </CardHeader>
          </Card>
        </div>
      </PublicRoute>
    );
  }

  if (verifyEmail.isSuccess) {
    return (
      <PublicRoute>
        <div className="flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-md border-border/50 bg-card/95 backdrop-blur-sm">
            <CardHeader className="space-y-1 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--primary)/10">
                <CheckCircle className="h-6 w-6 text-(--primary)" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">
                Email verified!
              </CardTitle>
              <CardDescription>
                Your email has been verified successfully. You can now sign in
                to your account.
              </CardDescription>
            </CardHeader>

            <CardFooter>
              <Link to="/login" className="w-full">
                <Button className="w-full">Sign in</Button>
              </Link>
            </CardFooter>
          </Card>
        </div>
      </PublicRoute>
    );
  }

  const errorMessage = getErrorMessage(verifyEmail.error);

  return (
    <PublicRoute>
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50 bg-card/95 backdrop-blur-sm">
          <CardHeader className="space-y-1 text-center">
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--destructive)/10">
              <AlertCircle className="h-6 w-6 text-(--destructive)" />
            </div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              Verification failed
            </CardTitle>
            <CardDescription>
              <span role="alert" aria-live="polite">
                {errorMessage}
              </span>
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            {isAuthenticated && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => resendVerification.mutate()}
                disabled={resendVerification.isPending}
              >
                {resendVerification.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  <>
                    <Mail className="mr-2 h-4 w-4" />
                    Resend verification email
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
                A new verification email has been sent. Please check your inbox.
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
                  ? 'Too many attempts. Please wait a moment.'
                  : 'Failed to resend verification email. Please try again.'}
              </div>
            )}
          </CardContent>

          <CardFooter>
            <Link
              to="/login"
              className="flex w-full items-center justify-center gap-2 text-sm font-medium text-(--muted-foreground) hover:text-(--foreground)"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to login
            </Link>
          </CardFooter>
        </Card>
      </div>
    </PublicRoute>
  );
}

function getErrorMessage(error: Error | null): string {
  if (!error) {
    return 'Something went wrong. Please try again.';
  }

  if (ApiClientError.isApiClientError(error)) {
    if (error.status === 400 || error.status === 404) {
      return 'This verification link is invalid or has expired. Please request a new one.';
    }
    if (error.status === 409) {
      return 'This email has already been verified.';
    }
  }

  return error.message || 'Something went wrong. Please try again.';
}
