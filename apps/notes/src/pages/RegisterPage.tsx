import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Link } from '@tanstack/react-router';

import { applyServerFieldErrors } from '@/auth';
import { getAnonymousUserId } from '@/auth/anonymous-session';
import { useTranslatedSchema } from '@/hooks/useTranslatedSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import { getPasswordChecks } from '@jovandyaz/auth';
import type { RegisterFormData } from '@jovandyaz/auth-react';
import {
  createRegisterSchema,
  useRateLimitState,
  useRegister,
  useResendVerification,
} from '@jovandyaz/auth-react';
import { ArrowLeft, CheckCircle, Loader2, Mail } from 'lucide-react';
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
  Input,
  LoadingButton,
  MutationErrorAlert,
  PasswordInput,
  PasswordStrength,
  RateLimitAlert,
} from '@knowtis/design-system';

import { AuthPageLayout } from './AuthPageLayout';

export function RegisterPage() {
  const { t } = useTranslation('auth');
  const registerMutation = useRegister();
  const resendVerification = useResendVerification();
  const { rateLimited, checkRateLimit, resetRateLimit } = useRateLimitState();
  const [registeredEmail, setRegisteredEmail] = useState('');
  const registerSchema = useTranslatedSchema(createRegisterSchema);

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

  const strengthLabels = {
    weak: t('passwordStrength.weak'),
    fair: t('passwordStrength.fair'),
    good: t('passwordStrength.good'),
    strong: t('passwordStrength.strong'),
  };

  const onSubmit = (data: RegisterFormData) => {
    resetRateLimit();
    registerMutation.mutate(
      { name: data.name, email: data.email, password: data.password },
      {
        onSuccess: () => {
          toast.success(t('register.successToast'));
          setRegisteredEmail(data.email);
        },
        onError: (error) => {
          if (checkRateLimit(error)) {
            toast.error(t('errors.tooManyAttempts', { ns: 'common' }));
            return;
          }

          if (ApiClientError.isApiClientError(error) && error.status === 409) {
            setError('email', {
              type: 'server',
              message: error.message,
            });
            setFocus('email');
            return;
          }

          applyServerFieldErrors<RegisterFormData>(error, setError, setFocus);
        },
      }
    );
  };

  if (registeredEmail) {
    return (
      <AuthPageLayout>
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--primary)/10">
            <CheckCircle className="h-6 w-6 text-(--primary)" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {t('verifyEmail.checkEmail')}
          </CardTitle>
          <CardDescription>
            {t('verifyEmail.sentVerificationTo')}{' '}
            <span className="font-medium text-(--foreground)">
              {registeredEmail}
            </span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <p className="text-center text-sm text-(--muted-foreground)">
            {t('verifyEmail.checkSpam')}
          </p>

          {resendVerification.isSuccess && (
            <div
              role="alert"
              aria-live="polite"
              className="rounded-md bg-(--primary)/10 p-3 text-center text-sm text-(--primary)"
            >
              {t('verifyEmail.resentSuccess')}
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

          <Button
            variant="outline"
            className="w-full"
            onClick={() => resendVerification.mutate()}
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

  const hasFieldErrors =
    ApiClientError.isApiClientError(registerMutation.error) &&
    (registerMutation.error.status === 409 ||
      !!registerMutation.error.errors?.length);

  return (
    <AuthPageLayout>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          {t('register.title')}
        </CardTitle>
        <CardDescription>{t('register.description')}</CardDescription>
        {getAnonymousUserId() && (
          <p className="text-sm text-(--muted-foreground) text-center">
            {t('register.anonymousMigration')}
          </p>
        )}
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4">
          <RateLimitAlert
            visible={rateLimited}
            message={t('rateLimitAlert', { ns: 'errors' })}
          />

          <MutationErrorAlert
            error={registerMutation.error}
            isError={registerMutation.isError}
            rateLimited={rateLimited}
            hasFieldErrors={hasFieldErrors}
            fallbackMessage={t('register.failedError')}
          />

          <FormField
            id="name"
            label={t('register.fullName')}
            error={errors.name?.message}
          >
            <Input
              id="name"
              placeholder={t('register.namePlaceholder')}
              autoComplete="name"
              aria-invalid={!!errors.name}
              aria-describedby={errors.name ? 'name-error' : undefined}
              {...register('name')}
            />
          </FormField>

          <FormField
            id="email"
            label={t('labels.email', { ns: 'common' })}
            error={errors.email?.message}
          >
            <Input
              id="email"
              type="email"
              placeholder={t('register.emailPlaceholder')}
              autoComplete="email"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
            />
          </FormField>

          <FormField
            id="password"
            label={t('labels.password', { ns: 'common' })}
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
            loading={registerMutation.isPending}
            loadingText={t('register.buttonLoading')}
          >
            {t('register.button')}
          </LoadingButton>

          <p className="text-center text-sm text-(--muted-foreground)">
            {t('register.hasAccount')}{' '}
            <Link
              to="/login"
              search={{ redirect: undefined }}
              className="font-medium text-(--foreground) hover:underline"
            >
              {t('login.button')}
            </Link>
          </p>
        </CardFooter>
      </form>
    </AuthPageLayout>
  );
}
