import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Link } from '@tanstack/react-router';

import { PublicRoute } from '@/components/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ForgotPasswordFormData } from '@jovandyaz/auth-react';
import {
  forgotPasswordSchema,
  useForgotPassword,
  useRateLimitState,
} from '@jovandyaz/auth-react';
import { ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  RateLimitAlert,
} from '@knowtis/design-system';

export function ForgotPasswordPage() {
  const forgotPassword = useForgotPassword();
  const { rateLimited, checkRateLimit, resetRateLimit } = useRateLimitState();
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormData>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: '',
    },
  });

  const onSubmit = (data: ForgotPasswordFormData) => {
    resetRateLimit();
    forgotPassword.mutate(data.email, {
      onSuccess: () => {
        toast.success('If the email exists, a reset link will be sent.');
        setSubmittedEmail(data.email);
        setSubmitted(true);
      },
      onError: (error) => {
        if (checkRateLimit(error)) {
          toast.error('Too many attempts. Please try again later.');
        }
      },
    });
  };

  const handleResend = () => {
    resetRateLimit();
    forgotPassword.mutate(submittedEmail, {
      onError: (error) => {
        if (checkRateLimit(error)) {
          toast.error('Too many attempts. Please try again later.');
        }
      },
    });
  };

  if (submitted) {
    return (
      <PublicRoute>
        <div className="flex min-h-screen items-center justify-center p-4">
          <Card className="w-full max-w-md border-border/50 bg-card/95 backdrop-blur-sm">
            <CardHeader className="space-y-1 text-center">
              <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--primary)/10">
                <CheckCircle className="h-6 w-6 text-(--primary)" />
              </div>
              <CardTitle className="text-2xl font-bold tracking-tight">
                Check your email
              </CardTitle>
              <CardDescription>
                We sent a password reset link to{' '}
                <span className="font-medium text-(--foreground)">
                  {submittedEmail}
                </span>
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <RateLimitAlert visible={rateLimited} />

              <p className="text-center text-sm text-(--muted-foreground)">
                Didn&apos;t receive the email? Check your spam folder or try
                again.
              </p>

              <Button
                variant="outline"
                className="w-full"
                onClick={handleResend}
                disabled={forgotPassword.isPending}
              >
                {forgotPassword.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Resend email'
                )}
              </Button>
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

  return (
    <PublicRoute>
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50 bg-card/95 backdrop-blur-sm">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold tracking-tight">
              Forgot your password?
            </CardTitle>
            <CardDescription>
              Enter your email and we&apos;ll send you a reset link
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-4">
              <RateLimitAlert visible={rateLimited} />

              {forgotPassword.isError && !rateLimited && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-md bg-(--destructive)/10 p-3 text-sm text-(--destructive)"
                >
                  {forgotPassword.error instanceof Error
                    ? forgotPassword.error.message
                    : 'Something went wrong. Please try again.'}
                </div>
              )}

              <div className="space-y-2">
                <label
                  htmlFor="email"
                  className="text-sm font-medium text-(--foreground)"
                >
                  Email
                </label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? 'email-error' : undefined}
                  {...register('email')}
                />
                {errors.email && (
                  <p
                    id="email-error"
                    role="alert"
                    className="text-sm text-(--destructive)"
                  >
                    {errors.email.message}
                  </p>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button
                type="submit"
                className="w-full"
                disabled={forgotPassword.isPending}
              >
                {forgotPassword.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Sending...
                  </>
                ) : (
                  'Send reset link'
                )}
              </Button>

              <Link
                to="/login"
                className="flex items-center justify-center gap-2 text-sm font-medium text-(--muted-foreground) hover:text-(--foreground)"
              >
                <ArrowLeft className="h-4 w-4" />
                Back to login
              </Link>
            </CardFooter>
          </form>
        </Card>
      </div>
    </PublicRoute>
  );
}
