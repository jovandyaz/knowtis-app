import { useForm } from 'react-hook-form';

import { Link, useNavigate } from '@tanstack/react-router';

import { PublicRoute } from '@/components/auth';
import { zodResolver } from '@hookform/resolvers/zod';
import type { LoginFormData } from '@jovandyaz/auth-react';
import {
  loginSchema,
  useLogin,
  useRateLimitState,
} from '@jovandyaz/auth-react';
import { Loader2 } from 'lucide-react';
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
  RateLimitAlert,
} from '@knowtis/design-system';

export function LoginPage() {
  const login = useLogin();
  const navigate = useNavigate();
  const { rateLimited, checkRateLimit, resetRateLimit } = useRateLimitState();

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = (data: LoginFormData) => {
    resetRateLimit();
    login.mutate(data, {
      onSuccess: () => {
        toast.success('Welcome back!');
        navigate({ to: '/' });
      },
      onError: (error) => {
        if (checkRateLimit(error)) {
          toast.error('Too many attempts. Please try again later.');
          return;
        }

        if (ApiClientError.isApiClientError(error) && error.errors?.length) {
          const fields = error.errors.map(
            (e) => e.field as keyof LoginFormData
          );
          for (const fieldError of error.errors) {
            setError(fieldError.field as keyof LoginFormData, {
              type: 'server',
              message: fieldError.message,
            });
          }
          setFocus(fields[0]);
        }
      },
    });
  };

  return (
    <PublicRoute>
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md border-border/50 bg-card/95 backdrop-blur-sm">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-2xl font-bold tracking-tight">
              Welcome back
            </CardTitle>
            <CardDescription>
              Sign in to your account to continue
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardContent className="space-y-4">
              <RateLimitAlert visible={rateLimited} />

              {login.isError &&
                !rateLimited &&
                !(
                  ApiClientError.isApiClientError(login.error) &&
                  login.error.errors?.length
                ) && (
                  <div
                    role="alert"
                    aria-live="polite"
                    className="rounded-md bg-(--destructive)/10 p-3 text-sm text-(--destructive)"
                  >
                    {login.error instanceof Error
                      ? login.error.message
                      : 'Invalid email or password'}
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
                  autoComplete="current-password"
                  aria-invalid={!!errors.password}
                  aria-describedby={
                    errors.password ? 'password-error' : undefined
                  }
                  {...register('password')}
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
              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-sm font-medium text-(--muted-foreground) hover:text-(--foreground)"
                >
                  Forgot password?
                </Link>
              </div>
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <Button
                type="submit"
                className="w-full"
                disabled={login.isPending}
              >
                {login.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Signing in...
                  </>
                ) : (
                  'Sign in'
                )}
              </Button>

              <p className="text-center text-sm text-(--muted-foreground)">
                Don&apos;t have an account?{' '}
                <Link
                  to="/register"
                  className="font-medium text-(--foreground) hover:underline"
                >
                  Create one
                </Link>
              </p>
            </CardFooter>
          </form>
        </Card>
      </div>
    </PublicRoute>
  );
}
