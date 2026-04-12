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
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_DEFAULT_MODEL: z.string().default('anthropic:claude-sonnet-4-20250514'),
  AI_FAST_MODEL: z.string().default('anthropic:claude-haiku-4-5-20251001'),
  AI_DAILY_TOKEN_LIMIT: z.coerce.number().default(100000),
  AI_DAILY_COST_LIMIT_USD: z.coerce.number().default(1.0),
  AI_MAX_RETRIES: z.coerce.number().default(3),
  AI_FALLBACK_MODEL: z.string().default('anthropic:claude-haiku-4-5-20251001'),
  AI_TIMEOUT_MS: z.coerce.number().default(30000),
  AI_STREAM_CHUNK_TIMEOUT_MS: z.coerce.number().default(10000),
  AI_CACHE_TTL_SECONDS: z.coerce.number().default(3600),
  AI_CACHE_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  AI_RPM_LIMIT: z.coerce.number().default(15),
  AI_MAX_CONCURRENT_STREAMS: z.coerce.number().default(2),
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
