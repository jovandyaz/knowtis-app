import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { Link } from '@tanstack/react-router';

import { PublicRoute } from '@/components/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import type { RegisterFormData } from '@jovandyaz/auth-react';
import {
  registerSchema,
  useRateLimitState,
  useRegister,
  useResendVerification,
} from '@jovandyaz/auth-react';
import { getPasswordChecks } from '@jovandyaz/auth/client';
import { ArrowLeft, CheckCircle, Loader2, Mail } from 'lucide-react';
import { toast } from 'sonner';

import { ApiClientError } from '@knowtis/api-client';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  PasswordInput,
  PasswordStrength,
  RateLimitAlert,
} from '@knowtis/design-system';

export function RegisterPage() {
  const registerMutation = useRegister();
  const resendVerification = useResendVerification();
  const { rateLimited, checkRateLimit, resetRateLimit } = useRateLimitState();
  const [registeredEmail, setRegisteredEmail] = useState('');

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    watch,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
    },
  });

  const password = watch('password');

  const onSubmit = (data: RegisterFormData) => {
    resetRateLimit();
    registerMutation.mutate(
      { name: data.name, email: data.email, password: data.password },
      {
        onSuccess: () => {
          toast.success('Account created successfully!');
          setRegisteredEmail(data.email);
        },
        onError: (error) => {
          if (checkRateLimit(error)) {
            toast.error('Too many attempts. Please try again later.');
            return;
          }

          if (ApiClientError.isApiClientError(error)) {
            if (error.status === 409) {
              setError('email', {
                type: 'server',
                message: error.message,
              });
              setFocus('email');
              return;
            }

            if (error.errors?.length) {
              const fields = error.errors.map(
                (e) => e.field as keyof RegisterFormData
              );
              for (const fieldError of error.errors) {
                setError(fieldError.field as keyof RegisterFormData, {
                  type: 'server',
                  message: fieldError.message,
                });
              }
              setFocus(fields[0]);
            }
          }
        },
      }
    );
  };

  if (registeredEmail) {
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
                We sent a verification link to{' '}
                <span className="font-medium text-(--foreground)">
                  {registeredEmail}
                </span>
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <p className="text-center text-sm text-(--muted-foreground)">
                Please verify your email address to get started. Check your spam
                folder if you don&apos;t see it.
              </p>

              {resendVerification.isSuccess && (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-md bg-(--primary)/10 p-3 text-center text-sm text-(--primary)"
                >
                  A new verification email has been sent.
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
              Create an account
            </CardTitle>
            <CardDescription>
              Enter your email below to create your account
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-4">
              <RateLimitAlert visible={rateLimited} />

              {registerMutation.isError &&
                !rateLimited &&
                !(
                  ApiClientError.isApiClientError(registerMutation.error) &&
                  (registerMutation.error.status === 409 ||
                    registerMutation.error.errors?.length)
                ) && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="rounded-md bg-(--destructive)/10 p-3 text-sm text-(--destructive)"
                  >
                    {registerMutation.error instanceof Error
                      ? registerMutation.error.message
                      : 'Registration failed'}
                  </div>
                )}

              <div className="space-y-2">
                <label
                  htmlFor="name"
                  className="text-sm font-medium text-(--foreground)"
                >
                  Full Name
                </label>
                <Input
                  id="name"
                  placeholder="John Doe"
                  autoComplete="name"
                  aria-invalid={!!errors.name}
                  aria-describedby={errors.name ? 'name-error' : undefined}
                  {...register('name')}
                />
                {errors.name && (
                  <p
                    id="name-error"
                    role="alert"
                    className="text-sm text-(--destructive)"
                  >
                    {errors.name.message}
                  </p>
                )}
              </div>

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

              <div className="space-y-2">
                <label
                  htmlFor="password"
                  className="text-sm font-medium text-(--foreground)"
                >
                  Password
                </label>
                <PasswordInput
                  id="password"
                  placeholder="••••••••"
                  autoComplete="new-password"
                  aria-invalid={!!errors.password}
                  aria-describedby={
                    errors.password ? 'password-error' : undefined
                  }
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
                disabled={registerMutation.isPending}
              >
                {registerMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  'Create account'
                )}
              </Button>

              <p className="text-center text-sm text-(--muted-foreground)">
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="font-medium text-(--foreground) hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </PublicRoute>
  );
}
