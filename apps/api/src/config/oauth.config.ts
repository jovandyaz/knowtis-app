import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { EnvConfig } from './env.config';
import { parseOauthJwks } from './oauth-public-keys';

export interface OauthConfig {
  issuer: string;
  jwks: { keys: Record<string, unknown>[] };
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
    `OAuth config unavailable (${reason}); the OAuth mount stays dormant.`
  );
}

/**
 * Resolves the OAuth authorization-server config from validated env, or null
 * when any piece is missing. A null return keeps the OAuth mount dormant; the
 * reason is warned once.
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

  const parsedJwks = parseOauthJwks(rawJwks);
  if (!parsedJwks) {
    warnDormantOnce('OAUTH_JWKS is unset');
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

  return { issuer, jwks: parsedJwks.jwks, cookieKeys, resourceUrl };
}
