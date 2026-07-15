import { useForm } from 'react-hook-form';

import { useNavigate } from '@tanstack/react-router';

import { syncUserProfile } from '@/auth/setup';
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
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormData>({ resolver: zodResolver(LoginSchema) });

  const onSubmit = handleSubmit(async (data) => {
    await login.mutateAsync(data);
    await syncUserProfile();
    navigate({ to: '/' });
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
              {...register('password')}
            />
          </FormField>
          <MutationErrorAlert
            error={login.error}
            isError={login.isError}
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
