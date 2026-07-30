import { useState } from 'react';
import { useForm } from 'react-hook-form';

import { useNavigate } from '@tanstack/react-router';

import { syncUserProfile } from '@/auth/setup';
import { ROUTES } from '@/config/routes.config';
import { zodResolver } from '@hookform/resolvers/zod';
import { useLogin } from '@jovandyaz/auth-react';
import { z } from 'zod';

import {
  Card,
  FormField,
  Input,
  LoadingButton,
  MutationErrorAlert,
  PasswordInput,
} from '@knowtis/design-system';

const LoginSchema = z.object({
  email: z.email(),
  password: z.string().min(1, 'Password is required'),
});

type LoginFormData = z.infer<typeof LoginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const [submitError, setSubmitError] = useState<Error | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(LoginSchema) });

  const onSubmit = handleSubmit(async (data) => {
    setSubmitError(null);
    try {
      await login.mutateAsync(data);
      await syncUserProfile();
      navigate({ to: ROUTES.ROOT });
    } catch (error) {
      console.warn('[backoffice-auth] login flow failed', error);
      setSubmitError(
        error instanceof Error ? error : new Error('Login failed')
      );
    }
  });

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6">
        <h1 className="mb-6 text-xl font-semibold">Knowtis Backoffice</h1>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <FormField id="email" label="Email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
            />
          </FormField>
          <FormField
            id="password"
            label="Password"
            error={errors.password?.message}
          >
            <PasswordInput
              id="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
          </FormField>
          <MutationErrorAlert
            error={login.error ?? submitError}
            isError={login.isError || submitError !== null}
            fallbackMessage="Invalid credentials"
          />
          <LoadingButton
            type="submit"
            loading={isSubmitting}
            loadingText="Signing in..."
          >
            Sign in
          </LoadingButton>
        </form>
      </Card>
    </div>
  );
}
