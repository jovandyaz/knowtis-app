import { ConfigService } from '@nestjs/config';
import { vi } from 'vitest';

import type { EnvConfig } from '../../../config/env.config';

type TypedConfigService = ConfigService<EnvConfig, true>;

const DEFAULT_AI_CONFIG: Record<string, unknown> = {
  AI_DEFAULT_MODEL: 'anthropic:claude-sonnet-4-20250514',
  AI_FAST_MODEL: 'anthropic:claude-haiku-4-5-20251001',
  AI_FALLBACK_CHAIN:
    'anthropic:claude-haiku-4-5-20251001,openai:gpt-4o-mini,google:gemini-2.0-flash',
  AI_COOLDOWN_ALLOWED_FAILS: 3,
  AI_COOLDOWN_SECONDS: 120,
  AI_TRANSCRIPTION_MODEL: 'openai:whisper-1',
  AI_DAILY_TOKEN_LIMIT: 100000,
  AI_DAILY_COST_LIMIT_USD: 1.0,
  AI_ANONYMOUS_DAILY_LIMIT_PCT: 0.33,
  AI_MAX_RETRIES: 3,
  AI_TIMEOUT_MS: 30000,
  AI_STREAM_MAX_MS: 180000,
  AI_STREAM_CHUNK_TIMEOUT_MS: 10000,
  AI_CACHE_TTL_SECONDS: 3600,
  AI_CACHE_ENABLED: true,
  AI_RPM_LIMIT: 15,
  AI_MAX_CONCURRENT_STREAMS: 2,
  FRONTEND_URL: 'http://localhost:4200',
  ANTHROPIC_API_KEY: 'test-anthropic-key',
  OPENAI_API_KEY: '',
};

export function createMockConfig(
  overrides?: Record<string, unknown>
): TypedConfigService {
  const config = { ...DEFAULT_AI_CONFIG, ...overrides };
  return {
    get: vi.fn((key: string) => config[key]),
  } as unknown as TypedConfigService;
}
