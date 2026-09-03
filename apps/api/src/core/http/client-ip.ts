import type { IncomingHttpHeaders } from 'node:http';

export interface ClientIpSource {
  headers: IncomingHttpHeaders;
  ip?: string | undefined;
}

/**
 * Client IP from Railway's edge-set X-Real-IP header. The edge overwrites any
 * client-supplied value with the true source IP (verified against prod, see
 * docs/AI.md "Per-IP anonymous budget"), so unlike X-Forwarded-For it cannot
 * be rotated by the caller to mint fresh per-IP buckets. Single-valued per the
 * platform contract; first element if it ever arrives as an array. Undefined
 * when absent. Never reads x-forwarded-for.
 */
export function realIpOf(headers: IncomingHttpHeaders): string | undefined {
  const value = headers['x-real-ip'];
  const first = Array.isArray(value) ? value[0] : value;
  return first || undefined;
}

/**
 * Key for anything bucketed per client IP. Falls back to Express's req.ip
 * (socket address, or X-Forwarded-For under trust proxy) where no edge stamps
 * X-Real-IP: local development and tests, and production callers on the
 * private network (the MCP service, Railway's rollout healthcheck). Without an
 * edge the header is client-controlled, which only matters where there is an
 * adversary to control it.
 */
export function clientIpOf(req: ClientIpSource): string {
  return realIpOf(req.headers) || req.ip || 'unknown';
}
