import { z } from 'zod';

const configSchema = z.object({
  PORT: z.coerce.number().default(3334),
  API_INTERNAL_URL: z.string().url(),
  MCP_SERVER_NAME: z.string().default('knowtis-mcp'),
  MCP_SERVER_VERSION: z.string().default('0.0.1'),
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
    serverVersion: parsed.MCP_SERVER_VERSION,
    isDev: parsed.NODE_ENV === 'development',
  };
}
