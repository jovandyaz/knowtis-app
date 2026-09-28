import { Inject, Injectable } from '@nestjs/common';

import type {
  MessageQuotaPort,
  QuotaConsumeResult,
  QuotaSubjects,
  QuotaTurn,
} from '../../domain/ports/message-quota.port';
import type { UtcDay } from '../../domain/value-objects/utc-day';
import { AI_REDIS, AIRedisProvider } from './ai-redis.provider';

// KEYS[1] is the turn marker, KEYS[2..] the subject counters. Every counter is
// read before any write: a script that errors keeps its earlier writes, so a
// denial on one subject must leave all of them untouched.
const CONSUME_LUA = `
local limit = tonumber(ARGV[1])
local ttl = tonumber(ARGV[2])
local used = 0
for i = 2, #KEYS do
  local count = tonumber(redis.call('GET', KEYS[i]) or '0')
  if count > used then
    used = count
  end
end
if redis.call('EXISTS', KEYS[1]) == 1 then
  return {1, used, 1}
end
if used >= limit then
  return {0, used, 0}
end
for i = 2, #KEYS do
  redis.call('INCR', KEYS[i])
  if redis.call('TTL', KEYS[i]) == -1 then
    redis.call('EXPIRE', KEYS[i], ttl)
  end
end
redis.call('SET', KEYS[1], '1', 'EX', ttl)
return {1, used + 1, 0}
`;

const REFUND_LUA = `
if redis.call('DEL', KEYS[1]) == 0 then
  return 0
end
for i = 2, #KEYS do
  if tonumber(redis.call('GET', KEYS[i]) or '0') > 0 then
    redis.call('DECR', KEYS[i])
  end
end
return 1
`;

/** Outlives the day it counts, so a turn that crosses midnight still refunds the day it consumed. */
const QUOTA_KEY_TTL_SECONDS = 48 * 60 * 60;
const MARKER_KEYS = 1;

@Injectable()
export class RedisMessageQuotaAdapter implements MessageQuotaPort {
  constructor(@Inject(AI_REDIS) private readonly redis: AIRedisProvider) {}

  async consume(turn: QuotaTurn, limit: number): Promise<QuotaConsumeResult> {
    const [allowed, used, replayed] = (await this.redis.client.eval(
      CONSUME_LUA,
      MARKER_KEYS + turn.subjects.length,
      ...keysOf(turn),
      limit,
      QUOTA_KEY_TTL_SECONDS
    )) as [number, number, number];
    return allowed === 1
      ? { allowed: true, used, replayed: replayed === 1 }
      : { allowed: false, used };
  }

  async refund(turn: QuotaTurn): Promise<boolean> {
    const refunded = (await this.redis.client.eval(
      REFUND_LUA,
      MARKER_KEYS + turn.subjects.length,
      ...keysOf(turn)
    )) as number;
    return refunded === 1;
  }

  async usage(subjects: QuotaSubjects, day: UtcDay): Promise<number> {
    const counts = await this.redis.client.mget(
      ...subjects.map((subject) => counterKey(subject, day))
    );
    return Math.max(
      0,
      ...counts.map((count) => (count === null ? 0 : Number(count)))
    );
  }
}

function keysOf(turn: QuotaTurn): string[] {
  return [
    markerKey(turn),
    ...turn.subjects.map((subject) => counterKey(subject, turn.day)),
  ];
}

function counterKey(subject: string, day: UtcDay): string {
  return `ai:quota:msgs:${subject}:${day.key}`;
}

// Scoped to the caller and the day, so a turn id replayed after its claim
// expires, or reused by another caller, never rides an earlier consumption.
function markerKey({ subjects, day, turnId }: QuotaTurn): string {
  return `ai:quota:turn:${subjects[0]}:${day.key}:${turnId}`;
}
