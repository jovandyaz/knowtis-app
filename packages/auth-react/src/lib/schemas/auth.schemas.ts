import { getPasswordChecks } from '@jovandyaz/auth/client';
import { z } from 'zod';

const passwordField = z
  .string()
  .min(1, 'Password is required')
  .superRefine((password, ctx) => {
    for (const check of getPasswordChecks()) {
      if (!check.test(password)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: check.label,
        });
      }
    }
  });

export const loginSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: z
      .string()
      .min(2, 'Name must be at least 2 characters')
      .max(50, 'Name must be at most 50 characters'),
    email: z.string().min(1, 'Email is required').email('Invalid email format'),
    password: passwordField,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Email is required').email('Invalid email format'),
});

export type ForgotPasswordFormData = z.infer<typeof forgotPasswordSchema>;

export const resetPasswordSchema = z
  .object({
    password: passwordField,
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export type ResetPasswordFormData = z.infer<typeof resetPasswordSchema>;
