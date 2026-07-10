import { z } from 'zod';

import pkg from '../package.json';

const emptyToUndefined = (value: unknown) => (value === '' ? undefined : value);

const configSchema = z.object({
  PORT: z.coerce.number().default(3334),
  API_INTERNAL_URL: z
    .string()
    .url()
    .transform((url) => url.replace(/\/+$/, '')),
  MCP_SERVER_NAME: z.string().default('knowtis-mcp'),
  MCP_ALLOWED_HOSTS: z.string().optional(),
  MCP_ALLOWED_ORIGINS: z.string().optional(),
  MCP_OAUTH_ISSUER: z.preprocess(emptyToUndefined, z.string().url().optional()),
  MCP_RESOURCE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

export interface OauthConfig {
  issuer: string;
  resourceUrl: string;
  jwksUrl: string;
  metadataUrl: string;
}

export interface AppConfig {
  port: number;
  apiInternalUrl: string;
  serverName: string;
  serverVersion: string;
  isDev: boolean;
  allowedHosts: string[];
  allowedOrigins: string[];
  enableDnsRebindingProtection: boolean;
  oauth: OauthConfig | null;
}

function splitCsv(value?: string): string[] {
  return value
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

export function resolveApiUrl(env: NodeJS.ProcessEnv): string {
  return (
    env.KNOWTIS_API_URL || env.API_INTERNAL_URL || 'https://api.knowtis.app'
  );
}

export function parseConfig(
  env: Record<string, string | undefined>,
  options?: { requireHttpSecurity?: boolean }
): AppConfig {
  const requireHttpSecurity = options?.requireHttpSecurity ?? true;
  const parsed = configSchema.parse(env);
  const isDev = parsed.NODE_ENV === 'development';
  const configuredHosts = splitCsv(parsed.MCP_ALLOWED_HOSTS);
  const allowedHosts =
    configuredHosts.length > 0
      ? configuredHosts
      : isDev
        ? [`localhost:${parsed.PORT}`, `127.0.0.1:${parsed.PORT}`]
        : [];
  const allowedOrigins = splitCsv(parsed.MCP_ALLOWED_ORIGINS);

  if (
    requireHttpSecurity &&
    parsed.NODE_ENV === 'production' &&
    allowedHosts.length === 0 &&
    allowedOrigins.length === 0
  ) {
    throw new Error(
      'MCP_ALLOWED_HOSTS or MCP_ALLOWED_ORIGINS must be set in production; without them DNS-rebinding protection is disabled.'
    );
  }

  return {
    port: parsed.PORT,
    apiInternalUrl: parsed.API_INTERNAL_URL,
    serverName: parsed.MCP_SERVER_NAME,
    serverVersion: pkg.version,
    isDev,
    allowedHosts,
    allowedOrigins,
    enableDnsRebindingProtection:
      allowedHosts.length > 0 || allowedOrigins.length > 0,
    oauth: parseOauth(parsed.MCP_OAUTH_ISSUER, parsed.MCP_RESOURCE_URL),
  };
}

function parseOauth(
  issuer: string | undefined,
  resource: string | undefined
): OauthConfig | null {
  if (!issuer && !resource) {
    return null;
  }
  if (!issuer || !resource) {
    throw new Error(
      'MCP_OAUTH_ISSUER and MCP_RESOURCE_URL must both be set to enable OAuth resource-server metadata; set both or neither.'
    );
  }
  const normalizedIssuer = issuer.replace(/\/+$/, '');
  const resourceUrl = resource.replace(/\/+$/, '');
  return {
    issuer: normalizedIssuer,
    resourceUrl,
    jwksUrl: `${normalizedIssuer}/oauth/jwks`,
    metadataUrl: `${new URL(resourceUrl).origin}/.well-known/oauth-protected-resource`,
  };
}
