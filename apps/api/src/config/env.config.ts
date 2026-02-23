import { DEFAULT_FROM_ADDRESS } from '@jovandyaz/email-nestjs';
import { z } from 'zod';

const envSchemaBase = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_CALLBACK_URL: z.url().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  GITHUB_CALLBACK_URL: z.url().optional(),
  FRONTEND_URL: z.url().default('http://localhost:4200'),
  EMAIL_PROVIDER: z.enum(['resend', 'console']).default('console'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default(DEFAULT_FROM_ADDRESS),
});

const envSchema = envSchemaBase.superRefine((data, ctx) => {
  if (data.EMAIL_PROVIDER === 'resend' && !data.RESEND_API_KEY) {
    ctx.addIssue({
      code: 'custom',
      message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
      path: ['RESEND_API_KEY'],
      input: data.RESEND_API_KEY,
    });
  }
});

export type EnvConfig = z.infer<typeof envSchemaBase>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Environment validation failed:\n${errors}`);
  }

  return result.data;
}
