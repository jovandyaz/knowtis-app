import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../../config/env.config';
import type {
  RateLimitCheckResult,
  RateLimitProvider,
} from '../../domain/ports/rate-limit.port';
import { AI_REDIS, AIRedisProvider } from './ai-redis.provider';

const SLIDING_WINDOW_LUA = `
local token_key = KEYS[1]
local cost_key = KEYS[2]
local estimated_tokens = tonumber(ARGV[1])
local token_limit = tonumber(ARGV[2])
local cost_limit = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])

local current_tokens = tonumber(redis.call('GET', token_key) or '0')
local current_cost = tonumber(redis.call('GET', cost_key) or '0')

if (current_tokens + estimated_tokens) > token_limit then
  return {0, current_tokens, tostring(current_cost)}
end

if current_cost >= cost_limit then
  return {0, current_tokens, tostring(current_cost)}
end

redis.call('INCRBY', token_key, estimated_tokens)
if redis.call('TTL', token_key) == -1 then
  redis.call('EXPIRE', token_key, ttl)
end

return {1, current_tokens + estimated_tokens, tostring(current_cost)}
`;

const CORRECT_USAGE_LUA = `
local token_key = KEYS[1]
local cost_key = KEYS[2]
local token_delta = tonumber(ARGV[1])
local cost_increment = ARGV[2]
local ttl = tonumber(ARGV[3])

if token_delta ~= 0 then
  redis.call('INCRBY', token_key, token_delta)
end
if redis.call('TTL', token_key) == -1 then
  redis.call('EXPIRE', token_key, ttl)
end

local new_cost = redis.call('INCRBYFLOAT', cost_key, cost_increment)
if redis.call('TTL', cost_key) == -1 then
  redis.call('EXPIRE', cost_key, ttl)
end

return {tonumber(redis.call('GET', token_key)), new_cost}
`;

const RPM_CHECK_LUA = `
local rpm_key = KEYS[1]
local rpm_limit = tonumber(ARGV[1])
local ttl = 60

local current = tonumber(redis.call('GET', rpm_key) or '0')

if current >= rpm_limit then
  return {0, current}
end

redis.call('INCR', rpm_key)
if redis.call('TTL', rpm_key) == -1 then
  redis.call('EXPIRE', rpm_key, ttl)
end

return {1, current + 1}
`;

const KEY_TTL_SECONDS = 25 * 60 * 60;

@Injectable()
export class RedisRateLimitService implements RateLimitProvider {
  private readonly logger = new Logger(RedisRateLimitService.name);

  constructor(
    @Inject(AI_REDIS) private readonly redis: AIRedisProvider,
    private readonly configService: ConfigService<EnvConfig, true>
  ) {}

  async checkAndIncrement(
    userId: string,
    estimatedTokens: number
  ): Promise<RateLimitCheckResult> {
    const today = new Date().toISOString().slice(0, 10);
    const tokenKey = `ai:ratelimit:${userId}:tokens:${today}`;
    const costKey = `ai:ratelimit:${userId}:cost:${today}`;

    const result = (await this.redis.client.eval(
      SLIDING_WINDOW_LUA,
      2,
      tokenKey,
      costKey,
      estimatedTokens,
      this.configService.get('AI_DAILY_TOKEN_LIMIT'),
      this.configService.get('AI_DAILY_COST_LIMIT_USD'),
      KEY_TTL_SECONDS
    )) as [number, number, string];

    const allowed = result[0] === 1;
    const currentTokens = result[1];
    const currentCostUsd = parseFloat(result[2]);

    if (!allowed) {
      const tokenLimit = this.configService.get('AI_DAILY_TOKEN_LIMIT');
      const costLimit = this.configService.get('AI_DAILY_COST_LIMIT_USD');
      const reason =
        currentCostUsd >= costLimit
          ? `Daily cost limit exceeded ($${currentCostUsd.toFixed(2)}/$${costLimit.toFixed(2)})`
          : `Daily token limit exceeded (${currentTokens}/${tokenLimit})`;
      return { allowed: false, reason, currentTokens, currentCostUsd };
    }

    return { allowed: true, currentTokens, currentCostUsd };
  }

  async checkRpm(userId: string): Promise<RateLimitCheckResult> {
    const minute = Math.floor(Date.now() / 60000);
    const rpmKey = `ai:ratelimit:${userId}:rpm:${minute}`;

    const result = (await this.redis.client.eval(
      RPM_CHECK_LUA,
      1,
      rpmKey,
      this.configService.get('AI_RPM_LIMIT')
    )) as [number, number];

    const allowed = result[0] === 1;
    if (!allowed) {
      return {
        allowed: false,
        reason: `Rate limit exceeded (${result[1]} requests/min)`,
        currentTokens: 0,
        currentCostUsd: 0,
      };
    }

    return { allowed: true, currentTokens: 0, currentCostUsd: 0 };
  }

  async correctUsage(
    userId: string,
    estimatedTokens: number,
    actualTokens: number,
    costUsd: number
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const tokenKey = `ai:ratelimit:${userId}:tokens:${today}`;
    const costKey = `ai:ratelimit:${userId}:cost:${today}`;
    const tokenDelta = actualTokens - estimatedTokens;

    try {
      await this.redis.client.eval(
        CORRECT_USAGE_LUA,
        2,
        tokenKey,
        costKey,
        tokenDelta,
        costUsd.toFixed(6),
        KEY_TTL_SECONDS
      );
    } catch (error) {
      this.logger.warn('Redis usage correction failed', error);
    }
  }
}
