type LogLevel = 'info' | 'warn' | 'error';

interface LogEntry {
  level: LogLevel;
  event: string;
  [key: string]: unknown;
}

export function log(entry: LogEntry): void {
  const output = {
    ...entry,
    timestamp: new Date().toISOString(),
  };
  // MCP servers using stdio MUST NOT write to stdout (corrupts JSON-RPC).
  // Always use stderr for logging.
  process.stderr.write(JSON.stringify(output) + '\n');
}

/**
 * Boot-time echo of the resolved OAuth resource-server config so operators can
 * eyeball cross-service parity (issuer/resourceUrl must byte-equal the api AS)
 * in Railway logs. Public URLs only — never log secret material here.
 */
export function logOauthConfig(issuer: string, resourceUrl: string): void {
  log({
    level: 'info',
    event: 'oauth_config_loaded',
    issuer,
    resourceUrl,
  });
}

export function logToolCall(
  tool: string,
  apiKeyPrefix: string,
  durationMs: number,
  status: 'success' | 'error',
  errorCode?: string
): void {
  log({
    level: status === 'error' ? 'warn' : 'info',
    event: 'tool_call',
    tool,
    apiKeyPrefix,
    durationMs,
    status,
    ...(errorCode && { errorCode }),
  });
}
