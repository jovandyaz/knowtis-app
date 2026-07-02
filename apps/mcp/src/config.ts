import { z } from 'zod';

import pkg from '../package.json';

const configSchema = z.object({
  PORT: z.coerce.number().default(3334),
  API_INTERNAL_URL: z.string().url(),
  MCP_SERVER_NAME: z.string().default('knowtis-mcp'),
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
}

export function parseConfig(
  env: Record<string, string | undefined>
): AppConfig {
  const parsed = configSchema.parse(env);
  return {
    port: parsed.PORT,
    apiInternalUrl: parsed.API_INTERNAL_URL,
    serverName: parsed.MCP_SERVER_NAME,
    serverVersion: pkg.version,
    isDev: parsed.NODE_ENV === 'development',
  };
}
