import { getPasswordChecks } from '@jovandyaz/auth';
import { z } from 'zod';

type TFunction = (key: string, options?: Record<string, unknown>) => string;

const createPasswordField = (t: TFunction) =>
  z
    .string()
    .min(1, t('validation.passwordRequired'))
    .superRefine((password, ctx) => {
      for (const check of getPasswordChecks()) {
        if (!check.test(password)) {
          ctx.addIssue({
            code: 'custom',
            message: check.label,
            input: password,
          });
        }
      }
    });

export const createLoginSchema = (t: TFunction) =>
  z.object({
    email: z
      .string()
      .min(1, t('validation.emailRequired'))
      .email(t('validation.emailInvalid')),
    password: z.string().min(1, t('validation.passwordRequired')),
  });

export type LoginFormData = z.infer<ReturnType<typeof createLoginSchema>>;

export const createRegisterSchema = (t: TFunction) =>
  z
    .object({
      name: z
        .string()
        .min(2, t('validation.nameMin', { min: 2 }))
        .max(50, t('validation.nameMax', { max: 50 })),
      email: z
        .string()
        .min(1, t('validation.emailRequired'))
        .email(t('validation.emailInvalid')),
      password: createPasswordField(t),
      confirmPassword: z
        .string()
        .min(1, t('validation.confirmPasswordRequired')),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('validation.passwordsMismatch'),
      path: ['confirmPassword'],
    });

export type RegisterFormData = z.infer<ReturnType<typeof createRegisterSchema>>;

export const createForgotPasswordSchema = (t: TFunction) =>
  z.object({
    email: z
      .string()
      .min(1, t('validation.emailRequired'))
      .email(t('validation.emailInvalid')),
  });

export type ForgotPasswordFormData = z.infer<
  ReturnType<typeof createForgotPasswordSchema>
>;

export const createResetPasswordSchema = (t: TFunction) =>
  z
    .object({
      password: createPasswordField(t),
      confirmPassword: z
        .string()
        .min(1, t('validation.confirmPasswordRequired')),
    })
    .refine((data) => data.password === data.confirmPassword, {
      message: t('validation.passwordsMismatch'),
      path: ['confirmPassword'],
    });

export type ResetPasswordFormData = z.infer<
  ReturnType<typeof createResetPasswordSchema>
>;
