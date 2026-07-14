import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from '../../../../config/env.config';
import type {
  RateLimitCheckResult,
  RateLimitProvider,
  RateLimits,
} from '../../domain/ports/rate-limit.port';
import { AI_REDIS, AIRedisProvider } from './ai-redis.provider';

const SLIDING_WINDOW_LUA = `
local token_key = KEYS[1]
local cost_key = KEYS[2]
local global_key = KEYS[3]
local estimated_tokens = tonumber(ARGV[1])
local estimated_cost = tonumber(ARGV[2])
local token_limit = tonumber(ARGV[3])
local cost_limit = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])
local count_global = tonumber(ARGV[6])

local current_tokens = tonumber(redis.call('GET', token_key) or '0')
local current_cost = tonumber(redis.call('GET', cost_key) or '0')

if (current_tokens + estimated_tokens) > token_limit then
  return {0, current_tokens, tostring(current_cost), 'tokens'}
end

if current_cost >= cost_limit or (current_cost + estimated_cost) > cost_limit then
  return {0, current_tokens, tostring(current_cost), 'cost'}
end

redis.call('INCRBY', token_key, estimated_tokens)
if redis.call('TTL', token_key) == -1 then
  redis.call('EXPIRE', token_key, ttl)
end
local new_cost = redis.call('INCRBYFLOAT', cost_key, estimated_cost)
if redis.call('TTL', cost_key) == -1 then
  redis.call('EXPIRE', cost_key, ttl)
end
if count_global == 1 then
  redis.call('INCRBYFLOAT', global_key, estimated_cost)
  if redis.call('TTL', global_key) == -1 then
    redis.call('EXPIRE', global_key, ttl)
  end
end

return {1, current_tokens + estimated_tokens, tostring(new_cost), ''}
`;

const CORRECT_USAGE_LUA = `
local token_key = KEYS[1]
local cost_key = KEYS[2]
local global_key = KEYS[3]
local token_delta = tonumber(ARGV[1])
local cost_increment = ARGV[2]
local ttl = tonumber(ARGV[3])
local count_global = tonumber(ARGV[4])

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
if count_global == 1 then
  redis.call('INCRBYFLOAT', global_key, cost_increment)
  if redis.call('TTL', global_key) == -1 then
    redis.call('EXPIRE', global_key, ttl)
  end
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

const INCR_COST_LUA = `
local increment = ARGV[1]
local ttl = tonumber(ARGV[2])

for i = 1, #KEYS do
  redis.call('INCRBYFLOAT', KEYS[i], increment)
  if redis.call('TTL', KEYS[i]) == -1 then
    redis.call('EXPIRE', KEYS[i], ttl)
  end
end

return redis.call('GET', KEYS[1])
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
    subject: string,
    estimatedTokens: number,
    estimatedCostUsd: number,
    limits: RateLimits,
    countGlobal = true
  ): Promise<RateLimitCheckResult> {
    const { tokenLimit, costLimit } = limits;

    const today = new Date().toISOString().slice(0, 10);
    const tokenKey = `ai:ratelimit:${subject}:tokens:${today}`;
    const costKey = `ai:ratelimit:${subject}:cost:${today}`;

    const result = (await this.redis.client.eval(
      SLIDING_WINDOW_LUA,
      3,
      tokenKey,
      costKey,
      this.globalSpendKey(),
      estimatedTokens,
      estimatedCostUsd,
      tokenLimit,
      costLimit,
      KEY_TTL_SECONDS,
      countGlobal ? 1 : 0
    )) as [number, number, string, string];

    const allowed = result[0] === 1;
    const currentTokens = result[1];
    const currentCostUsd = parseFloat(result[2]);

    if (!allowed) {
      const reason =
        result[3] === 'cost'
          ? `Daily cost limit exceeded ($${currentCostUsd.toFixed(2)}/$${costLimit.toFixed(2)})`
          : `Daily token limit exceeded (${currentTokens}/${tokenLimit})`;
      return { allowed: false, reason, currentTokens, currentCostUsd };
    }

    return { allowed: true, currentTokens, currentCostUsd };
  }

  async checkRpm(subject: string): Promise<RateLimitCheckResult> {
    const minute = Math.floor(Date.now() / 60000);
    const rpmKey = `ai:ratelimit:${subject}:rpm:${minute}`;

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
    subject: string,
    estimatedTokens: number,
    actualTokens: number,
    estimatedCostUsd: number,
    actualCostUsd: number,
    countGlobal = true
  ): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    const tokenKey = `ai:ratelimit:${subject}:tokens:${today}`;
    const costKey = `ai:ratelimit:${subject}:cost:${today}`;
    const tokenDelta = actualTokens - estimatedTokens;
    const costDelta = actualCostUsd - estimatedCostUsd;

    try {
      await this.redis.client.eval(
        CORRECT_USAGE_LUA,
        3,
        tokenKey,
        costKey,
        this.globalSpendKey(),
        tokenDelta,
        costDelta.toFixed(6),
        KEY_TTL_SECONDS,
        countGlobal ? 1 : 0
      );
    } catch (error) {
      this.logger.warn('Redis usage correction failed', error);
    }
  }

  async recordByokCost(subject: string, costUsd: number): Promise<void> {
    await this.redis.client.eval(
      INCR_COST_LUA,
      2,
      this.byokCostKey(subject),
      this.globalSpendKey(),
      costUsd.toFixed(6),
      KEY_TTL_SECONDS
    );
  }

  async getByokCostUsd(subject: string): Promise<number> {
    const value = await this.redis.client.get(this.byokCostKey(subject));
    return value === null ? 0 : Number.parseFloat(value);
  }

  async recordGlobalCost(costUsd: number): Promise<void> {
    await this.redis.client.eval(
      INCR_COST_LUA,
      1,
      this.globalSpendKey(),
      costUsd.toFixed(6),
      KEY_TTL_SECONDS
    );
  }

  async getGlobalSpendUsd(): Promise<number> {
    const value = await this.redis.client.get(this.globalSpendKey());
    return value === null ? 0 : Number.parseFloat(value);
  }

  async claimDailyFlag(name: string): Promise<boolean> {
    const today = new Date().toISOString().slice(0, 10);
    const claimed = await this.redis.client.set(
      `ai:${name}:${today}`,
      '1',
      'EX',
      KEY_TTL_SECONDS,
      'NX'
    );
    return claimed === 'OK';
  }

  private byokCostKey(subject: string): string {
    const today = new Date().toISOString().slice(0, 10);
    return `ai:ratelimit:${subject}:byok_cost:${today}`;
  }

  private globalSpendKey(): string {
    const today = new Date().toISOString().slice(0, 10);
    return `ai:spend:global:${today}`;
  }
}
