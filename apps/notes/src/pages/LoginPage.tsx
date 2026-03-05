import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Link, useNavigate, useSearch } from '@tanstack/react-router';

import { applyServerFieldErrors, resolvePostLoginRedirect } from '@/auth';
import { useTranslatedSchema } from '@/hooks/useTranslatedSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import type { LoginFormData } from '@jovandyaz/auth-react';
import {
  createLoginSchema,
  useLogin,
  useRateLimitState,
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
  RateLimitAlert,
} from '@knowtis/design-system';

import { AuthPageLayout } from './AuthPageLayout';

export function LoginPage() {
  const { t } = useTranslation('auth');
  const login = useLogin();
  const navigate = useNavigate();
  const search = useSearch({ from: '/login' });
  const { rateLimited, checkRateLimit, resetRateLimit } = useRateLimitState();
  const loginSchema = useTranslatedSchema(createLoginSchema);

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
        navigate({ to: resolvePostLoginRedirect(search.redirect) });
      },
      onError: (error) => {
        if (checkRateLimit(error)) {
          toast.error(t('login.rateLimitToast'));
          return;
        }

        applyServerFieldErrors<LoginFormData>(error, setError, setFocus);
      },
    });
  };

  const hasFieldErrors =
    ApiClientError.isApiClientError(login.error) &&
    !!login.error.errors?.length;

  return (
    <AuthPageLayout>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          {t('login.title')}
        </CardTitle>
        <CardDescription>{t('login.description')}</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4">
          <RateLimitAlert
            visible={rateLimited}
            message={t('rateLimitAlert', { ns: 'errors' })}
          />

          <MutationErrorAlert
            error={login.error}
            isError={login.isError}
            rateLimited={rateLimited}
            hasFieldErrors={hasFieldErrors}
            fallbackMessage={t('login.invalidCredentials')}
          />

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
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
          </FormField>

          <div className="flex justify-end">
            <Link
              to="/forgot-password"
              className="text-sm font-medium text-(--muted-foreground) hover:text-(--foreground)"
            >
              {t('login.forgotPassword')}
            </Link>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <LoadingButton
            type="submit"
            className="w-full"
            loading={login.isPending}
            loadingText={t('login.buttonLoading')}
          >
            {t('login.button')}
          </LoadingButton>

          <p className="text-center text-sm text-(--muted-foreground)">
            {t('login.noAccount')}{' '}
            <Link
              to="/register"
              className="font-medium text-(--foreground) hover:underline"
            >
              {t('login.createOne')}
            </Link>
          </p>
        </CardFooter>
      </form>
    </AuthPageLayout>
  );
}
