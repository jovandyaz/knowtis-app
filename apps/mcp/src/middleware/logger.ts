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
