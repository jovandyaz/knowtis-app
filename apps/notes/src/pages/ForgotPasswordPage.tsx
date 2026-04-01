import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { Link } from '@tanstack/react-router';

import { ROUTES } from '@/config';
import { useTranslatedSchema } from '@/hooks/useTranslatedSchema';
import { zodResolver } from '@hookform/resolvers/zod';
import type { ForgotPasswordFormData } from '@jovandyaz/auth-react';
import {
  createForgotPasswordSchema,
  useForgotPassword,
  useRateLimitState,
} from '@jovandyaz/auth-react';
import { ArrowLeft, CheckCircle } from 'lucide-react';
import { toast } from 'sonner';

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
  RateLimitAlert,
} from '@knowtis/design-system';

import { AuthPageLayout } from './AuthPageLayout';

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth');
  const forgotPassword = useForgotPassword();
  const { rateLimited, checkRateLimit, resetRateLimit } = useRateLimitState();
  const [submitted, setSubmitted] = useState(false);
  const [submittedEmail, setSubmittedEmail] = useState('');
  const forgotPasswordSchema = useTranslatedSchema(createForgotPasswordSchema);

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
        toast.success(t('forgotPassword.successToast'));
        setSubmittedEmail(data.email);
        setSubmitted(true);
      },
      onError: (error) => {
        if (checkRateLimit(error)) {
          toast.error(t('errors.tooManyAttempts', { ns: 'common' }));
        }
      },
    });
  };

  const handleResend = () => {
    resetRateLimit();
    forgotPassword.mutate(submittedEmail, {
      onError: (error) => {
        if (checkRateLimit(error)) {
          toast.error(t('errors.tooManyAttempts', { ns: 'common' }));
        }
      },
    });
  };

  if (submitted) {
    return (
      <AuthPageLayout>
        <CardHeader className="space-y-1 text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-(--primary)/10">
            <CheckCircle className="h-6 w-6 text-(--primary)" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight">
            {t('forgotPassword.checkEmail')}
          </CardTitle>
          <CardDescription>
            {t('forgotPassword.sentResetLinkTo')}{' '}
            <span className="font-medium text-(--foreground)">
              {submittedEmail}
            </span>
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <RateLimitAlert
            visible={rateLimited}
            message={t('rateLimitAlert', { ns: 'errors' })}
          />

          <p className="text-center text-sm text-(--muted-foreground)">
            {t('forgotPassword.checkSpam')}
          </p>

          <LoadingButton
            variant="outline"
            className="w-full"
            onClick={handleResend}
            loading={forgotPassword.isPending}
            loadingText={t('forgotPassword.buttonLoading')}
          >
            {t('forgotPassword.resendButton')}
          </LoadingButton>
        </CardContent>

        <CardFooter>
          <Link
            to={ROUTES.LOGIN}
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

  return (
    <AuthPageLayout>
      <CardHeader className="space-y-1 text-center">
        <CardTitle className="text-2xl font-bold tracking-tight">
          {t('forgotPassword.title')}
        </CardTitle>
        <CardDescription>{t('forgotPassword.description')}</CardDescription>
      </CardHeader>

      <form onSubmit={handleSubmit(onSubmit)} noValidate>
        <CardContent className="space-y-4">
          <RateLimitAlert
            visible={rateLimited}
            message={t('rateLimitAlert', { ns: 'errors' })}
          />

          <MutationErrorAlert
            error={forgotPassword.error}
            isError={forgotPassword.isError}
            rateLimited={rateLimited}
            fallbackMessage={t('forgotPassword.genericError')}
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
        </CardContent>

        <CardFooter className="flex flex-col gap-4">
          <LoadingButton
            type="submit"
            className="w-full"
            loading={forgotPassword.isPending}
            loadingText={t('forgotPassword.buttonLoading')}
          >
            {t('forgotPassword.button')}
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
