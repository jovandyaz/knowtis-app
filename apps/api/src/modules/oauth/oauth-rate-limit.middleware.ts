import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  ipKeyGenerator,
  rateLimit,
  type AugmentedRequest,
  type Options,
} from 'express-rate-limit';

import { clientIpOf } from '../../core/http/client-ip';
import { isOauthPath } from './oidc-mount.middleware';

// oidc-provider's koa router is non-strict + case-insensitive, so open DCR
// create also answers at /oauth/reg/ and /oauth/REG; catch every variant while
// excluding the token-authenticated /oauth/reg/:clientId RFC 7592 endpoints.
const DCR_REGISTRATION_PATH_PATTERN = /^\/oauth\/reg\/?$/i;

interface RateLimitTier {
  windowMs: number;
  limit: number;
}

const DCR_RATE_LIMIT: RateLimitTier = { windowMs: 60 * 60 * 1000, limit: 10 };
const OAUTH_RATE_LIMIT: RateLimitTier = { windowMs: 60 * 1000, limit: 60 };

export interface OauthRateLimitOptions {
  dcr?: Partial<RateLimitTier>;
  oauth?: Partial<RateLimitTier>;
}

function retryAfterSeconds(req: Request, options: Options): number {
  const resetTime = (req as AugmentedRequest)[options.requestPropertyName]
    ?.resetTime;
  if (resetTime instanceof Date) {
    const seconds = Math.ceil((resetTime.getTime() - Date.now()) / 1000);
    if (seconds > 0) {
      return seconds;
    }
  }
  return Math.ceil(options.windowMs / 1000);
}

function sendRateLimited(
  req: Request,
  res: Response,
  _next: NextFunction,
  options: Options
): void {
  res.setHeader('Retry-After', String(retryAfterSeconds(req, options)));
  res.status(options.statusCode).json({
    error: 'temporarily_unavailable',
    error_description:
      'Too many requests to the OAuth endpoint. Try again later.',
  });
}

function buildTier(tier: RateLimitTier): RequestHandler {
  return rateLimit({
    windowMs: tier.windowMs,
    limit: tier.limit,
    standardHeaders: true,
    legacyHeaders: false,
    // ipKeyGenerator folds IPv6 into a /56 so one client cannot rotate
    // addresses inside its own allocation.
    keyGenerator: (req) => ipKeyGenerator(clientIpOf(req)),
    handler: sendRateLimited,
  });
}

/**
 * Per-IP rate limiter for the /oauth/* surface, meant to run in front of
 * createOidcMount so it also covers requests that oidc-provider handles before
 * Nest's ThrottlerGuard. A strict tier bounds the open DCR write
 * (POST /oauth/reg); a looser tier covers token/authorize/discovery. Non-oauth
 * paths pass through uncounted. Keys on the edge-set X-Real-IP
 * (core/http/client-ip.ts), falling back to req.ip where no edge is present.
 */
export function createOauthRateLimit(
  options?: OauthRateLimitOptions
): RequestHandler {
  const dcrLimiter = buildTier({ ...DCR_RATE_LIMIT, ...options?.dcr });
  const oauthLimiter = buildTier({ ...OAUTH_RATE_LIMIT, ...options?.oauth });

  return (req: Request, res: Response, next: NextFunction) => {
    if (!isOauthPath(req.path)) {
      next();
      return;
    }
    if (req.method === 'POST' && DCR_REGISTRATION_PATH_PATTERN.test(req.path)) {
      dcrLimiter(req, res, next);
      return;
    }
    oauthLimiter(req, res, next);
  };
}
