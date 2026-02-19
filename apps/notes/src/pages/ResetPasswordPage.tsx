import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Link, useSearch } from '@tanstack/react-router';

import { applyServerFieldErrors } from '@/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import { getPasswordChecks } from '@jovandyaz/auth';
import type { ResetPasswordFormData } from '@jovandyaz/auth-react';
import {
  resetPasswordSchema,
  useRateLimitState,
  useResetPassword,
} from '@jovandyaz/auth-react';
import { ArrowLeft, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { ApiClientError } from '@knowtis/api-client';
import {
  Button,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  PasswordInput,
  PasswordStrength,
  RateLimitAlert,
} from '@knowtis/design-system';

import { AuthPageLayout } from './AuthPageLayout';

export function ResetPasswordPage() {
  const { token } = useSearch({ from: '/reset-password' });
  const resetPassword = useResetPassword();
  const { rateLimited, checkRateLimit, resetRateLimit } = useRateLimitState();
  const [success, setSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    watch,
    formState: { errors },
  } = useForm<ResetPasswordFormData>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
    },
  });

  const password = watch('password');

  const onSubmit = (data: ResetPasswordFormData) => {
    if (!token) {
      return;
    }

    resetRateLimit();
    resetPassword.mutate(
      { token, newPassword: data.password },
      {
        onSuccess: () => {
          toast.success('Password has been reset successfully!');
          setSuccess(true);
        },
        onError: (error) => {
          if (checkRateLimit(error)) {
            toast.error('Too many attempts. Please try again later.');
            return;
          }

          applyServerFieldErrors<ResetPasswordFormData>(
            error,
            setError,
            setFocus
          );
        },
      }
    );
  };

  if (!token) {
    return (
      <AuthPageLayout>
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold tracking-tight">
            Invalid reset link
          </CardTitle>
          <CardDescription>
            This password reset link is invalid or has expired. Please request a
            new one.
          </CardDescription>
        </CardHeader>

        <CardFooter>
          <Link
            to="/forgot-password"
            className="flex w-full items-center justify-center gap-2 text-sm font-medium text-(--primary) hover:underline"
          >
            Request a new reset link
          </Link>
        </CardFooter>
      </AuthPageLayout>
    );
  }

  if (success) {
    return (
      <AuthPageLayout>
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--primary)/10">
            <CheckCircle className="h-6 w-6 text-(--primary)" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            Password reset successful
          </CardTitle>
          <CardDescription>
            Your password has been updated. You can now sign in with your new
            password.
          </CardDescription>
        </CardHeader>

        <CardFooter>
          <Link to="/login" search={{ redirect: undefined }} className="w-full">
            <Button className="w-full">Sign in</Button>
          </Link>
        </CardFooter>
      </AuthPageLayout>
    );
  }

  return (
    <AuthPageLayout>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          Reset your password
        </CardTitle>
        <CardDescription>Enter your new password below</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4">
          <RateLimitAlert visible={rateLimited} />

          {resetPassword.isError &&
            !rateLimited &&
            !(
              ApiClientError.isApiClientError(resetPassword.error) &&
              resetPassword.error.errors?.length
            ) && (
              <div
                role="alert"
                aria-live="polite"
                className="rounded-md bg-(--destructive)/10 p-3 text-sm text-(--destructive)"
              >
                {resetPassword.error instanceof Error
                  ? resetPassword.error.message
                  : 'Failed to reset password. The link may have expired.'}
              </div>
            )}

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-sm font-medium text-(--foreground)"
            >
              New Password
            </label>
            <PasswordInput
              id="password"
              placeholder="••••••••"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
            <PasswordStrength
              password={password}
              checks={getPasswordChecks()}
            />
            {errors.password && (
              <p
                id="password-error"
                role="alert"
                className="text-sm text-(--destructive)"
              >
                {errors.password.message}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label
              htmlFor="confirmPassword"
              className="text-sm font-medium text-(--foreground)"
            >
              Confirm Password
            </label>
            <PasswordInput
              id="confirmPassword"
              placeholder="••••••••"
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={
                errors.confirmPassword ? 'confirmPassword-error' : undefined
              }
              {...register('confirmPassword')}
            />
            {errors.confirmPassword && (
              <p
                id="confirmPassword-error"
                role="alert"
                className="text-sm text-(--destructive)"
              >
                {errors.confirmPassword.message}
              </p>
            )}
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <Button
            type="submit"
            className="w-full"
            disabled={resetPassword.isPending}
          >
            {resetPassword.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Resetting password...
              </>
            ) : (
              'Reset password'
            )}
          </Button>

          <Link
            to="/login"
            search={{ redirect: undefined }}
            className="flex items-center justify-center gap-2 text-sm font-medium text-(--muted-foreground) hover:text-(--foreground)"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to login
          </Link>
        </CardFooter>
      </form>
    </AuthPageLayout>
  );
}
