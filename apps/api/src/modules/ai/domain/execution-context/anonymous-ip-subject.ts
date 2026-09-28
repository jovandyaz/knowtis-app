import { createHash } from 'node:crypto';

import type { AiExecutionContext } from './ai-execution-context';

const IP_SUBJECT_PREFIX = 'ip:';
const IP_HASH_LENGTH = 16;

/**
 * The hashed per-IP subject an anonymous caller is also metered under, so
 * clearing the session cookie resets neither its budget nor its quota.
 * Undefined for other tiers, or when the caller has no client IP.
 */
export function anonIpSubject(
  execution: Pick<AiExecutionContext, 'tier' | 'subject'>
): string | undefined {
  const { clientIp } = execution.subject;
  if (execution.tier !== 'anonymous' || !clientIp) {
    return undefined;
  }
  const digest = createHash('sha256').update(clientIp).digest('hex');
  return `${IP_SUBJECT_PREFIX}${digest.slice(0, IP_HASH_LENGTH)}`;
}
