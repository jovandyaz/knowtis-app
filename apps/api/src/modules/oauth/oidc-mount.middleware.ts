import type { INestApplication } from '@nestjs/common';
import express from 'express';
import type { NextFunction, Request, RequestHandler, Response } from 'express';

import { FeatureFlagsService } from '../feature-flags';
import { OAUTH_PROVIDER } from './oauth.tokens';
import type { OidcProviderHandle } from './oidc-provider.factory';

export const MCP_OAUTH_FLAG = 'mcp_oauth';

const OAUTH_PREFIX = '/oauth';
const WELL_KNOWN_PATHS = new Set([
  '/.well-known/oauth-authorization-server',
  '/.well-known/openid-configuration',
]);

export function isOauthPath(path: string): boolean {
  return (
    path === OAUTH_PREFIX ||
    path.startsWith(`${OAUTH_PREFIX}/`) ||
    WELL_KNOWN_PATHS.has(path)
  );
}

/**
 * Forwards /oauth/* and the root well-knowns to oidc-provider, checking the
 * mcp_oauth flag per request so flipping it needs no restart. Anything not
 * handled falls through to Nest's router.
 *
 * oidc-provider derives its mount prefix from originalUrl minus url, so the
 * /oauth prefix is stripped from url (and prepended to originalUrl for the
 * root well-knowns) — discovery then stays at the RFC 8414 root while every
 * rendered endpoint URL is absolute and /oauth-prefixed.
 */
export function createOidcMount(app: INestApplication): RequestHandler {
  const handle = app.get<OidcProviderHandle | null>(OAUTH_PROVIDER);
  const flags = app.get(FeatureFlagsService);
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!handle || !isOauthPath(req.path)) {
        return next();
      }
      if (!(await flags.isEnabled(MCP_OAUTH_FLAG))) {
        return next();
      }
      if (req.path.startsWith(OAUTH_PREFIX)) {
        const stripped = req.url.slice(OAUTH_PREFIX.length);
        req.url = stripped.startsWith('/') ? stripped : `/${stripped}`;
      } else {
        req.originalUrl = `${OAUTH_PREFIX}${req.url}`;
      }
      handle.callback(req, res);
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Re-applies Nest's default body parsers (disabled app-wide via
 * bodyParser: false) everywhere except the oauth surfaces — oidc-provider
 * reads the raw request stream itself and a pre-parsed body breaks it.
 */
// Content autosaves carry the note's CRDT state alongside its HTML, which
// roughly doubles the payload; express's 100kb default cut those off.
const JSON_BODY_LIMIT = '2mb';

export function applyBodyParsersExcludingOauth(app: INestApplication): void {
  const jsonParser = express.json({ limit: JSON_BODY_LIMIT });
  const urlencodedParser = express.urlencoded({ extended: true });
  app.use((req: Request, res: Response, next: NextFunction) =>
    isOauthPath(req.path) ? next() : jsonParser(req, res, next)
  );
  app.use((req: Request, res: Response, next: NextFunction) =>
    isOauthPath(req.path) ? next() : urlencodedParser(req, res, next)
  );
}
