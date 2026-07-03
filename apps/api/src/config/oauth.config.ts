import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import type { EnvConfig } from './env.config';

const jwksSchema = z.object({
  keys: z.array(z.record(z.string(), z.unknown())).min(1),
});

type Jwks = z.infer<typeof jwksSchema>;

export interface OauthConfig {
  issuer: string;
  jwks: Jwks;
  cookieKeys: string[];
  resourceUrl: string;
}

const logger = new Logger('OauthConfig');
let dormantWarned = false;

function warnDormantOnce(reason: string): void {
  if (dormantWarned) {
    return;
  }
  dormantWarned = true;
  logger.warn(
    `OAuth config unavailable (${reason}); mcp_oauth stays dormant even if the flag is on.`
  );
}

function parseJwks(raw: string): Jwks | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = jwksSchema.safeParse(parsed);
  return result.success ? result.data : null;
}

/**
 * Resolves the OAuth authorization-server config from validated env, or null
 * when any piece is missing/malformed. A null return keeps the mcp_oauth
 * module dormant even when the feature flag is on; the reason is warned once.
 */
export function getOauthConfig(
  config: ConfigService<EnvConfig, true>
): OauthConfig | null {
  const issuer = config.get('OAUTH_ISSUER', { infer: true });
  const rawJwks = config.get('OAUTH_JWKS', { infer: true });
  const rawCookieKeys = config.get('OAUTH_COOKIE_KEYS', { infer: true });
  const resourceUrl = config.get('MCP_RESOURCE_URL', { infer: true });

  if (!issuer || !rawJwks || !rawCookieKeys || !resourceUrl) {
    warnDormantOnce(
      'one or more of OAUTH_ISSUER, OAUTH_JWKS, OAUTH_COOKIE_KEYS, MCP_RESOURCE_URL is unset'
    );
    return null;
  }

  const jwks = parseJwks(rawJwks);
  if (!jwks) {
    warnDormantOnce('OAUTH_JWKS is not valid JSON of shape { keys: [...] }');
    return null;
  }

  const cookieKeys = rawCookieKeys
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

  if (cookieKeys.length === 0) {
    warnDormantOnce('OAUTH_COOKIE_KEYS contains no usable secrets');
    return null;
  }

  return { issuer, jwks, cookieKeys, resourceUrl };
}
