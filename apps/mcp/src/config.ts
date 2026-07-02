import { z } from 'zod';

import pkg from '../package.json';

const configSchema = z.object({
  PORT: z.coerce.number().default(3334),
  API_INTERNAL_URL: z
    .string()
    .url()
    .transform((url) => url.replace(/\/+$/, '')),
  MCP_SERVER_NAME: z.string().default('knowtis-mcp'),
  MCP_ALLOWED_HOSTS: z.string().optional(),
  MCP_ALLOWED_ORIGINS: z.string().optional(),
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

export interface AppConfig {
  port: number;
  apiInternalUrl: string;
  serverName: string;
  serverVersion: string;
  isDev: boolean;
  allowedHosts: string[];
  allowedOrigins: string[];
  enableDnsRebindingProtection: boolean;
}

function splitCsv(value?: string): string[] {
  return value
    ? value
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
}

export function parseConfig(
  env: Record<string, string | undefined>
): AppConfig {
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
  };
}
