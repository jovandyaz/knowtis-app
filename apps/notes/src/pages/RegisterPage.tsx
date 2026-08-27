import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Link, useNavigate } from '@tanstack/react-router';

import { applyServerFieldErrors } from '@/auth';
import { getAnonymousUserId } from '@/auth/anonymous-session';
import { VerifyCodeStep } from '@/components/auth/VerifyCodeStep';
import { ROUTES } from '@/config';
import { useRateLimitState } from '@/hooks/useRateLimitState';
import { useTranslatedSchema } from '@/hooks/useTranslatedSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import { getPasswordChecks } from '@jovandyaz/auth';
import type { RegisterFormData } from '@jovandyaz/auth-react';
import {
  createRegisterSchema,
  useRegister,
} from '@jovandyaz/auth-react';
import { toast } from 'sonner';

import { ApiClientError } from '@knowtis/api-client';
import {
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
  const navigate = useNavigate();
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

  const enterApp = () => {
    navigate({ to: ROUTES.DASHBOARD });
  };

  if (registeredEmail) {
    return (
      <AuthPageLayout>
        <VerifyCodeStep
          email={registeredEmail}
          onVerified={() => {
            toast.success(t('verifyEmail.verifiedToast'));
            enterApp();
          }}
          onSkip={enterApp}
        />
      </AuthPageLayout>
    );
  }

  const registerError = ApiClientError.isApiClientError(registerMutation.error)
    ? registerMutation.error
    : null;
  const emailAlreadyRegistered = registerError?.status === 409;
  const hasFieldErrors =
    emailAlreadyRegistered || !!registerError?.errors?.length;

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
            {emailAlreadyRegistered && (
              <Link
                to={ROUTES.FORGOT_PASSWORD}
                className="block text-sm font-medium text-(--foreground) hover:underline"
              >
                {t('verifyEmail.emailTakenReclaim')}
              </Link>
            )}
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
              to={ROUTES.LOGIN}
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
