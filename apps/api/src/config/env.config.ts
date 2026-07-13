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
  BCRYPT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  FRONTEND_URL: z.url().default('http://localhost:4200'),
  EMAIL_PROVIDER: z.enum(['resend', 'console']).default('console'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default(DEFAULT_FROM_ADDRESS),
  AI_GATEWAY_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  AI_DEFAULT_MODEL: z.string().default('anthropic:claude-sonnet-4-6'),
  AI_FAST_MODEL: z.string().default('anthropic:claude-haiku-4-5-20251001'),
  AI_DAILY_TOKEN_LIMIT: z.coerce.number().default(100000),
  AI_DAILY_COST_LIMIT_USD: z.coerce.number().default(1.0),
  AI_BYOK_DAILY_COST_LIMIT_USD: z.coerce.number().default(1.0),
  AI_ANONYMOUS_DAILY_LIMIT_PCT: z.coerce.number().min(0).max(1).default(0.33),
  AI_MAX_RETRIES: z.coerce.number().default(3),
  AI_FALLBACK_CHAIN: z
    .string()
    .default(
      'anthropic:claude-haiku-4-5-20251001,openai:gpt-4o-mini,google:gemini-2.0-flash'
    ),
  AI_COOLDOWN_ALLOWED_FAILS: z.coerce.number().int().min(1).default(3),
  AI_COOLDOWN_SECONDS: z.coerce.number().int().min(1).default(120),
  AI_TRANSCRIPTION_MODEL: z.string().default('openai:whisper-1'),
  AI_ALERT_WEBHOOK_URL: z.string().url().optional(),
  AI_EVAL_MODEL: z.string().optional(),
  VOYAGE_API_KEY: z.string().optional(),
  AI_EMBEDDING_MODEL: z.string().default('voyage-4'),
  TAVILY_API_KEY: z.string().optional(),
  AI_WEB_SEARCH_MAX_RESULTS: z.coerce.number().int().min(1).max(10).default(5),
  AI_WEB_SEARCH_DEPTH: z.enum(['basic', 'advanced']).default('basic'),
  AI_TIMEOUT_MS: z.coerce.number().default(30000),
  AI_STREAM_MAX_MS: z.coerce.number().default(180000),
  AI_STREAM_CHUNK_TIMEOUT_MS: z.coerce.number().default(10000),
  AI_CACHE_TTL_SECONDS: z.coerce.number().default(3600),
  AI_CACHE_ENABLED: z
    .string()
    .default('true')
    .transform((v) => v === 'true'),
  AI_PRICING_REFRESH_ENABLED: z
    .string()
    .default('false')
    .transform((v) => v === 'true'),
  AI_RPM_LIMIT: z.coerce.number().default(15),
  AI_MAX_CONCURRENT_STREAMS: z.coerce.number().default(2),
  AI_AGENT_MAX_STEPS: z.coerce.number().int().min(1).max(20).default(8),
  AI_AGENT_MAX_MS: z.coerce.number().int().min(1000).default(120000),
  AI_AGENT_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).default(4096),
  AI_AGENT_HISTORY_LIMIT: z.coerce.number().int().min(1).max(200).default(40),
  AI_MEMORY_QUIET_SECONDS: z.coerce.number().int().min(10).default(180),
  AI_MEMORY_BATCH_SIZE: z.coerce.number().int().min(1).max(200).default(20),
  AI_MEMORY_MAX_PER_USER: z.coerce.number().int().min(1).max(1000).default(100),
  AI_MEMORY_RETRIEVAL_K: z.coerce.number().int().min(1).max(50).default(6),
  AI_MEMORY_SIMILARITY_MIN: z.coerce.number().min(0).max(1).default(0.2),
  AI_AGENT_PROPOSAL_TTL_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(600),
  VERCEL_BLOB_READ_WRITE_TOKEN: z.string().optional(),
  LANGFUSE_PUBLIC_KEY: z.string().optional(),
  LANGFUSE_SECRET_KEY: z.string().optional(),
  LANGFUSE_BASE_URL: z.url().default('https://cloud.langfuse.com'),
  BYOK_ENCRYPTION_KEY: z
    .string()
    .refine(
      (v) => Buffer.from(v, 'base64').length === 32,
      'BYOK_ENCRYPTION_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)'
    )
    .optional(),
  OAUTH_ISSUER: z.url().optional(),
  OAUTH_JWKS: z.string().optional(),
  OAUTH_COOKIE_KEYS: z.string().optional(),
  MCP_RESOURCE_URL: z.url().optional(),
});

const PLACEHOLDER_MARKERS = [
  'change-in-production',
  'your-super-secret',
  'changeme',
  'placeholder',
];

function isPlaceholderSecret(value: string): boolean {
  const normalized = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
}

const envSchema = envSchemaBase.superRefine((data, ctx) => {
  if (data.EMAIL_PROVIDER === 'resend' && !data.RESEND_API_KEY) {
    ctx.addIssue({
      code: 'custom',
      message: 'RESEND_API_KEY is required when EMAIL_PROVIDER=resend',
      path: ['RESEND_API_KEY'],
      input: data.RESEND_API_KEY,
    });
  }

  if (data.JWT_SECRET === data.JWT_REFRESH_SECRET) {
    ctx.addIssue({
      code: 'custom',
      message:
        'JWT_SECRET and JWT_REFRESH_SECRET must be different values — equal secrets let refresh tokens act as access tokens',
      path: ['JWT_REFRESH_SECRET'],
      input: data.JWT_REFRESH_SECRET,
    });
  }

  if (data.NODE_ENV === 'production') {
    for (const key of ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const) {
      if (isPlaceholderSecret(data[key])) {
        ctx.addIssue({
          code: 'custom',
          message: `${key} looks like a placeholder value — generate a real secret: openssl rand -base64 48`,
          path: [key],
          input: data[key],
        });
      }
    }
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
