import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Link, useSearch } from '@tanstack/react-router';

import { applyServerFieldErrors } from '@/auth';
import { ROUTES } from '@/config';
import { useTranslatedSchema } from '@/hooks/useTranslatedSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import { getPasswordChecks } from '@jovandyaz/auth';
import type { ResetPasswordFormData } from '@jovandyaz/auth-react';
import {
  createResetPasswordSchema,
  useRateLimitState,
  useResetPassword,
} from '@jovandyaz/auth-react';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

import { ApiClientError } from '@knowtis/api-client';
import {
  Button,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  FormField,
  LoadingButton,
  MutationErrorAlert,
  PasswordInput,
  PasswordStrength,
  RateLimitAlert,
} from '@knowtis/design-system';

import { AuthPageLayout } from './AuthPageLayout';

export function ResetPasswordPage() {
  const { t } = useTranslation('auth');
  const { token } = useSearch({ from: '/reset-password' });
  const resetPassword = useResetPassword();
  const { rateLimited, checkRateLimit, resetRateLimit } = useRateLimitState();
  const [success, setSuccess] = useState(false);
  const resetPasswordSchema = useTranslatedSchema(createResetPasswordSchema);

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

  const strengthLabels = {
    weak: t('passwordStrength.weak'),
    fair: t('passwordStrength.fair'),
    good: t('passwordStrength.good'),
    strong: t('passwordStrength.strong'),
  };

  const onSubmit = (data: ResetPasswordFormData) => {
    if (!token) {
      return;
    }

    resetRateLimit();
    resetPassword.mutate(
      { token, newPassword: data.password },
      {
        onSuccess: () => {
          toast.success(t('resetPassword.successToast'));
          setSuccess(true);
        },
        onError: (error) => {
          if (checkRateLimit(error)) {
            toast.error(t('errors.tooManyAttempts', { ns: 'common' }));
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
            {t('resetPassword.invalidLink')}
          </CardTitle>
          <CardDescription>
            {t('resetPassword.invalidLinkDesc')}
          </CardDescription>
        </CardHeader>

        <CardFooter>
          <Link
            to={ROUTES.FORGOT_PASSWORD}
            className="flex w-full items-center justify-center gap-2 text-sm font-medium text-(--primary) hover:underline"
          >
            {t('resetPassword.requestNewLink')}
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
            {t('resetPassword.successTitle')}
          </CardTitle>
          <CardDescription>{t('resetPassword.successDesc')}</CardDescription>
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

  const hasFieldErrors =
    ApiClientError.isApiClientError(resetPassword.error) &&
    !!resetPassword.error.errors?.length;

  return (
    <AuthPageLayout>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          {t('resetPassword.title')}
        </CardTitle>
        <CardDescription>{t('resetPassword.description')}</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4">
          <RateLimitAlert
            visible={rateLimited}
            message={t('rateLimitAlert', { ns: 'errors' })}
          />

          <MutationErrorAlert
            error={resetPassword.error}
            isError={resetPassword.isError}
            rateLimited={rateLimited}
            hasFieldErrors={hasFieldErrors}
            fallbackMessage={t('resetPassword.failedError')}
          />

          <FormField
            id="password"
            label={t('resetPassword.newPassword')}
            error={errors.password?.message}
          >
            <PasswordInput
              id="password"
              placeholder={t('register.passwordPlaceholder')}
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
            <PasswordStrength
              password={password}
              checks={getPasswordChecks()}
              labels={strengthLabels}
            />
          </FormField>

          <FormField
            id="confirmPassword"
            label={t('register.confirmPassword')}
            error={errors.confirmPassword?.message}
          >
            <PasswordInput
              id="confirmPassword"
              placeholder={t('register.passwordPlaceholder')}
              autoComplete="new-password"
              aria-invalid={!!errors.confirmPassword}
              aria-describedby={
                errors.confirmPassword ? 'confirmPassword-error' : undefined
              }
              {...register('confirmPassword')}
            />
          </FormField>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <LoadingButton
            type="submit"
            className="w-full"
            loading={resetPassword.isPending}
            loadingText={t('resetPassword.buttonLoading')}
          >
            {t('resetPassword.button')}
          </LoadingButton>

          <Link
            to={ROUTES.LOGIN}
            search={{ redirect: undefined }}
            className="flex items-center justify-center gap-2 text-sm font-medium text-(--muted-foreground) hover:text-(--foreground)"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('verifyEmail.backToLogin')}
          </Link>
        </CardFooter>
      </form>
    </AuthPageLayout>
  );
}
