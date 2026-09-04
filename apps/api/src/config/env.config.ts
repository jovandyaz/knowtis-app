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
  // Optional here only so the refinement below can name what is missing; shape
  // stays TokenHasher's to enforce, since it rejects a malformed key while
  // AuthModule is still being built, before this schema ever runs.
  TOKEN_HASH_KEY: z.string().optional(),
  FRONTEND_URL: z.url().default('http://localhost:4200'),
  BACKOFFICE_URL: z.url().optional(),
  EMAIL_PROVIDER: z.enum(['resend', 'console']).default('console'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default(DEFAULT_FROM_ADDRESS),
  AI_GATEWAY_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OPENROUTER_API_KEY: z.string().optional(),
  AI_GUARD_CLASSIFIER_MODEL: z.string().default('anthropic:claude-haiku-4-5'),
  AI_DAILY_TOKEN_LIMIT: z.coerce.number().default(100000),
  AI_DAILY_COST_LIMIT_USD: z.coerce.number().default(1.0),
  AI_BYOK_DAILY_COST_LIMIT_USD: z.coerce.number().default(1.0),
  AI_GLOBAL_DAILY_COST_LIMIT_USD: z.coerce.number().default(25),
  AI_ANONYMOUS_DAILY_LIMIT_PCT: z.coerce.number().min(0).max(1).default(0.33),
  AI_MAX_RETRIES: z.coerce.number().default(3),
  AI_COOLDOWN_ALLOWED_FAILS: z.coerce.number().int().min(1).default(3),
  AI_COOLDOWN_SECONDS: z.coerce.number().int().min(1).default(120),
  AI_TRANSCRIPTION_MODEL: z.string().default('openai:whisper-1'),
  AI_ALERT_WEBHOOK_URL: z.string().url().optional(),
  AGENT_TOOL_ERROR_ALERT_RATE: z.coerce.number().min(0).max(1).default(0.1),
  AGENT_STOP_ANOMALY_ALERT_RATE: z.coerce.number().min(0).max(1).default(0.2),
  AI_EVAL_MODEL: z.string().optional(),
  VOYAGE_API_KEY: z.string().optional(),
  AI_EMBEDDING_MODEL: z.string().default('voyage-4'),
  TAVILY_API_KEY: z.string().optional(),
  AI_WEB_SEARCH_MAX_RESULTS: z.coerce.number().int().min(1).max(10).default(5),
  AI_WEB_SEARCH_DEPTH: z.enum(['basic', 'advanced']).default('basic'),
  AI_WEB_SEARCH_PRICE_PER_CREDIT_USD: z.coerce.number().min(0).default(0),
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
  AI_AGENT_MAX_MS: z.coerce.number().int().min(1000).default(300000),
  AI_AGENT_STALL_MS: z.coerce.number().int().min(5000).default(60000),
  AI_AGENT_TTFT_MS: z.coerce.number().int().min(1000).default(30000),
  AI_AGENT_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(1).default(8192),
  AI_AGENT_TURN_TOKEN_BUDGET: z.coerce.number().int().min(1000).default(150000),
  AI_AGENT_HISTORY_LIMIT: z.coerce.number().int().min(1).max(400).default(120),
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
  POSTHOG_PROJECT_TOKEN: z.string().optional(),
  POSTHOG_HOST: z
    .url({ protocol: /^https$/ })
    .default('https://us.i.posthog.com'),
  RAILWAY_GIT_COMMIT_SHA: z.string().optional(),
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

/** Secrets `.env.example` ships a placeholder for, with the byte count of the real thing. */
const PLACEHOLDER_GUARDED_SECRETS = [
  { key: 'JWT_SECRET', bytes: 48 },
  { key: 'JWT_REFRESH_SECRET', bytes: 48 },
  { key: 'TOKEN_HASH_KEY', bytes: 32 },
] as const;

function isPlaceholderSecret(value: string): boolean {
  const normalized = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => normalized.includes(marker));
}

/**
 * dotenv materializes a bare `FOO=` as `''`, which no `.optional()` treats as
 * absent — so an example file that leaves a dormant var empty fails to boot.
 */
function withoutBlankValues(
  config: Record<string, unknown>
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(config).filter(([, value]) => value !== '')
  );
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

  if (data.AI_AGENT_STALL_MS >= data.AI_AGENT_MAX_MS) {
    ctx.addIssue({
      code: 'custom',
      message:
        'AI_AGENT_STALL_MS must be less than AI_AGENT_MAX_MS — a stall budget at or above the wall-clock ceiling never fires, disabling per-candidate stall detection and failover',
      path: ['AI_AGENT_STALL_MS'],
      input: data.AI_AGENT_STALL_MS,
    });
  }

  if (data.AI_AGENT_TTFT_MS >= data.AI_AGENT_STALL_MS) {
    ctx.addIssue({
      code: 'custom',
      message:
        'AI_AGENT_TTFT_MS must be less than AI_AGENT_STALL_MS — a first-part budget at or above the stall budget never fires, disabling zero-output retry',
      path: ['AI_AGENT_TTFT_MS'],
      input: data.AI_AGENT_TTFT_MS,
    });
  }

  if (data.NODE_ENV === 'production' && !data.BACKOFFICE_URL) {
    ctx.addIssue({
      code: 'custom',
      message:
        'BACKOFFICE_URL is required in production — without it the backoffice and the notes app resolve to the same refresh cookie and hand each other their sessions',
      path: ['BACKOFFICE_URL'],
      input: data.BACKOFFICE_URL,
    });
  }

  // Required in every environment, not just production: AuthModule reads it with
  // getOrThrow while the module is still being constructed, so a boot without it
  // dies there — past this schema, with a message that names no fix.
  if (!data.TOKEN_HASH_KEY) {
    ctx.addIssue({
      code: 'custom',
      message:
        'TOKEN_HASH_KEY is required — it keys every stored token hash, and without one a 6-digit verification code is recoverable from a stolen hash. Generate one with: openssl rand -base64 32',
      path: ['TOKEN_HASH_KEY'],
      input: data.TOKEN_HASH_KEY,
    });
  }

  if (data.NODE_ENV === 'production') {
    for (const { key, bytes } of PLACEHOLDER_GUARDED_SECRETS) {
      const value = data[key];
      if (value && isPlaceholderSecret(value)) {
        ctx.addIssue({
          code: 'custom',
          message: `${key} looks like a placeholder value — generate a real secret: openssl rand -base64 ${bytes}`,
          path: [key],
          input: value,
        });
      }
    }
  }
});

export type EnvConfig = z.infer<typeof envSchemaBase>;

export function validateEnv(config: Record<string, unknown>): EnvConfig {
  const result = envSchema.safeParse(withoutBlankValues(config));

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Environment validation failed:\n${errors}`);
  }

  return result.data;
}
